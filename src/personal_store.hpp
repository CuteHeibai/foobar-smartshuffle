#pragma once
#include "json.hpp"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <deque>
#include <limits>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

namespace ss {
class PersonalStore {
public:
    using json = nlohmann::json;
    // Loading is transactional. Unknown versions and malformed records never
    // replace an existing library. A persisted playing event is interrupted;
    // downtime is deliberately not counted as listening.
    void load(const json& document, int64_t now) {
        valid_time(now);
        if (!document.is_object() || !document.contains("version") || unsigned_value(document.at("version")) != 1)
            invalid("unsupported personal library version");
        for (const auto* key : {"revision", "next_event_id", "history", "favorites", "later"})
            if (!document.contains(key)) invalid("incomplete personal library");
        PersonalStore fresh;
        fresh.revision_ = unsigned_value(document.at("revision"));
        fresh.next_event_id_ = unsigned_value(document.at("next_event_id"));
        if (!fresh.next_event_id_) invalid("invalid next event id");
        fresh.load_members(document.at("favorites"), fresh.favorites_, fresh.favorite_ids_);
        fresh.load_members(document.at("later"), fresh.later_, fresh.later_ids_);
        if (!document.at("history").is_array()) invalid("history must be an array");
        std::unordered_set<uint64_t> event_ids;
        bool recovered = false;
        for (const auto& source : document.at("history")) {
            auto event = normalized_track(source);
            for (const auto* key : {"event_id", "started_at", "ended_at", "listened", "outcome", "qualified"})
                if (!source.contains(key)) invalid("incomplete history event");
            auto event_id = unsigned_value(source.at("event_id"));
            if (!event_id || event_id >= fresh.next_event_id_ || !event_ids.insert(event_id).second)
                invalid("invalid or duplicate event id");
            auto started = timestamp(source.at("started_at"));
            auto listened = nonnegative_number(source.at("listened"));
            if (!source.at("outcome").is_string() || !source.at("qualified").is_boolean()) invalid("invalid history status");
            auto outcome = source.at("outcome").get<std::string>();
            if (outcome.empty()) invalid("empty history outcome");
            json ended;
            if (outcome == "playing") {
                if (!source.at("ended_at").is_null()) invalid("playing event has an end time");
                outcome = "interrupted"; ended = (std::max)(now, started); recovered = true;
            } else {
                auto value = timestamp(source.at("ended_at"));
                if (value < started) invalid("end time precedes start time");
                ended = value;
            }
            event.update({{"event_id", event_id}, {"started_at", started}, {"ended_at", ended},
                {"listened", listened}, {"outcome", outcome}, {"qualified", qualifies(event, listened)}});
            fresh.history_.push_back(std::move(event));
        }
        if (fresh.prune(now) || recovered) fresh.bump();
        *this = std::move(fresh);
    }

    json dump() const {
        return {{"version", 1}, {"revision", revision_}, {"next_event_id", next_event_id_},
            {"history", history_}, {"favorites", favorites_}, {"later", later_}};
    }
    uint64_t revision() const { return revision_; }
    json summary(const std::string& nowId) const {
        return {{"revision", revision_}, {"history_count", history_.size()}, {"favorites_count", favorites_.size()},
            {"later_count", later_.size()}, {"now_favorite", favorite_ids_.contains(nowId)}, {"now_later", later_ids_.contains(nowId)}};
    }
    json page(const std::string& kind, size_t offset, size_t limit) const {
        json items = json::array();
        limit = (std::min)(limit, size_t(100));
        size_t total;
        if (kind == "history") { total = history_.size(); append_page(history_, offset, limit, items); }
        else { const auto& collection = members(kind); total = collection.size(); append_page(collection, offset, limit, items); }
        return {{"kind", kind}, {"offset", offset}, {"total", total}, {"revision", revision_}, {"items", std::move(items)}};
    }
    json flags(const std::vector<std::string>& ids) const {
        if (ids.size() > 256) invalid("personal flags accepts at most 256 tracks");
        json result = json::array();
        for (const auto& id : ids) result.push_back({{"id", id}, {"favorite", favorite_ids_.contains(id)}, {"later", later_ids_.contains(id)}});
        return result;
    }

    // Validate the complete batch before changing anything. Repeating an
    // explicit true preserves the existing metadata, added_at and order.
    bool set(const std::string& kind, const std::vector<json>& tracks, bool value, int64_t now) {
        auto& collection = members(kind); auto& ids = member_ids(kind); valid_time(now);
        std::vector<json> normalized; std::unordered_set<std::string> seen;
        for (const auto& source : tracks) {
            auto entry = normalized_track(source); auto id = entry.at("id").get<std::string>();
            if (seen.insert(id).second) normalized.push_back(std::move(entry));
        }
        bool changed = false;
        for (const auto& entry : normalized) if (ids.contains(entry.at("id").get<std::string>()) != value) { changed = true; break; }
        if (!changed) return false;
        bump();
        if (value) {
            for (auto& entry : normalized) {
                auto id = entry.at("id").get<std::string>();
                if (ids.insert(id).second) { entry["added_at"] = now; collection.push_front(std::move(entry)); }
            }
        } else {
            for (const auto& entry : normalized) ids.erase(entry.at("id").get<std::string>());
            std::erase_if(collection, [&](const json& entry) { return !ids.contains(entry.at("id").get<std::string>()); });
        }
        prune(now);
        return true;
    }
    bool contains(const std::string& kind, const std::string& id) const { return member_ids(kind).contains(id); }

    void begin(const json& track, int64_t now) {
        auto event = normalized_track(track); valid_time(now);
        if (next_event_id_ == (std::numeric_limits<uint64_t>::max)()) throw std::overflow_error("personal event id exhausted");
        if (active_) finish("interrupted", now);
        bump();
        event.update({{"event_id", next_event_id_++}, {"started_at", now}, {"ended_at", nullptr},
            {"listened", 0.0}, {"outcome", "playing"}, {"qualified", false}});
        history_.push_front(std::move(event)); active_ = true;
        prune(now);
    }
    // Caller supplies actual unpaused elapsed time, never playback position.
    // Sampling deliberately leaves revision stable; begin/finish publish it.
    void listen(double seconds) {
        if (!active_ || !std::isfinite(seconds) || seconds <= 0) return;
        auto& event = history_.front(); auto total = event.at("listened").get<double>() + seconds;
        if (!std::isfinite(total)) return;
        event["listened"] = total; event["qualified"] = qualifies(event, total);
    }
    void finish(const std::string& outcome, int64_t now) {
        valid_time(now);
        if (outcome.empty() || outcome == "playing") invalid("invalid completed outcome");
        if (!active_) return;
        bump();
        auto& event = history_.front(); event["outcome"] = outcome;
        event["ended_at"] = (std::max)(now, event.at("started_at").get<int64_t>());
        event["qualified"] = qualifies(event, event.at("listened").get<double>());
        active_ = false; prune(now);
    }
    bool active() const { return active_; }

private:
    using Collection = std::deque<json>;
    using Ids = std::unordered_set<std::string>;
    Collection history_, favorites_, later_;
    Ids favorite_ids_, later_ids_;
    uint64_t revision_ = 0, next_event_id_ = 1;
    bool active_ = false;
    [[noreturn]] static void invalid(const char* message) { throw std::invalid_argument(message); }
    static void valid_time(int64_t value) { if (value < 0) invalid("negative personal timestamp"); }
    static uint64_t unsigned_value(const json& value) {
        if (value.is_number_unsigned()) return value.get<uint64_t>();
        if (value.is_number_integer()) { auto number = value.get<int64_t>(); if (number >= 0) return static_cast<uint64_t>(number); }
        invalid("expected nonnegative integer");
    }
    static int64_t timestamp(const json& value) {
        auto number = unsigned_value(value);
        if (number > static_cast<uint64_t>((std::numeric_limits<int64_t>::max)())) invalid("timestamp out of range");
        return static_cast<int64_t>(number);
    }
    static double nonnegative_number(const json& value) {
        if (!value.is_number()) invalid("expected numeric duration");
        auto number = value.get<double>();
        if (!std::isfinite(number) || number < 0) invalid("invalid duration or listening time");
        return number;
    }
    static json normalized_track(const json& source) {
        if (!source.is_object() || !source.contains("id") || !source.at("id").is_string() || source.at("id").get_ref<const std::string&>().empty())
            invalid("track requires nonempty id");
        json result = {{"id", source.at("id")}};
        for (const auto* key : {"title", "artist", "album"}) {
            if (source.contains(key) && !source.at(key).is_string()) invalid("invalid track metadata");
            result[key] = source.value(key, std::string{});
        }
        result["duration"] = source.contains("duration") ? nonnegative_number(source.at("duration")) : 0.0;
        return result;
    }
    static bool qualifies(const json& event, double listened) {
        auto duration = event.at("duration").get<double>();
        return listened >= (duration > 0 ? (std::min)(60.0, duration / 2.0) : 60.0);
    }
    static void load_members(const json& source, Collection& collection, Ids& ids) {
        if (!source.is_array()) invalid("personal collection must be an array");
        for (const auto& record : source) {
            auto entry = normalized_track(record);
            if (!record.contains("added_at")) invalid("missing added_at");
            entry["added_at"] = timestamp(record.at("added_at"));
            if (!ids.insert(entry.at("id").get<std::string>()).second) invalid("duplicate personal member");
            collection.push_back(std::move(entry));
        }
    }
    Collection& members(const std::string& kind) {
        if (kind == "favorites") return favorites_;
        if (kind == "later") return later_;
        invalid("invalid personal collection kind");
    }
    const Collection& members(const std::string& kind) const {
        if (kind == "favorites") return favorites_;
        if (kind == "later") return later_;
        invalid("invalid personal collection kind");
    }
    Ids& member_ids(const std::string& kind) {
        if (kind == "favorites") return favorite_ids_;
        if (kind == "later") return later_ids_;
        invalid("invalid personal collection kind");
    }
    const Ids& member_ids(const std::string& kind) const {
        if (kind == "favorites") return favorite_ids_;
        if (kind == "later") return later_ids_;
        invalid("invalid personal collection kind");
    }
    static void append_page(const Collection& collection, size_t offset, size_t limit, json& result) {
        if (offset >= collection.size()) return;
        auto count = (std::min)(limit, collection.size() - offset);
        for (size_t i = 0; i < count; ++i) result.push_back(collection[offset + i]);
    }
    void bump() {
        if (revision_ == (std::numeric_limits<uint64_t>::max)()) throw std::overflow_error("personal revision exhausted");
        ++revision_;
    }
    bool prune(int64_t now) {
        constexpr int64_t retention = 90LL * 24 * 60 * 60;
        const auto cutoff = now > retention ? now - retention : 0;
        auto previous = history_.size();
        // Collection order is insertion order, independent of wall-clock jumps.
        std::erase_if(history_, [&](const json& event) { return event.at("started_at").get<int64_t>() < cutoff; });
        if (history_.size() > 10000) history_.resize(10000);
        if (active_ && (history_.empty() || history_.front().at("outcome") != "playing")) active_ = false;
        return previous != history_.size();
    }
};
}
