#include "core.hpp"
#include <algorithm>
#include <cmath>
#include <cctype>
#include <limits>
#include <numeric>
#include <random>
#include <set>
#include <unordered_set>

namespace ss {
namespace {
constexpr double unknown = std::numeric_limits<double>::quiet_NaN();
double coordinate(double value) { return std::isfinite(value) ? std::clamp(value, -1.0, 1.0) : 0.0; }
Point normalized(Point p) { return {coordinate(p.x), coordinate(p.y)}; }
double count(double value) { return std::isfinite(value) && value > 0 ? value : 0; }

std::string label(std::string text) {
    const auto first = text.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return {};
    text = text.substr(first, text.find_last_not_of(" \t\r\n") - first + 1);
    for (char& c : text) if (static_cast<unsigned char>(c) < 128) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return text;
}
std::set<std::string> genres(const std::string& text) {
    std::set<std::string> result;
    std::size_t start = 0;
    while (start < text.size()) {
        const auto end = text.find_first_of(";,|", start);
        auto token = label(text.substr(start, end == std::string::npos ? end : end - start));
        if (!token.empty()) result.insert(std::move(token));
        if (end == std::string::npos) break;
        start = end + 1;
    }
    return result;
}
double tag_similarity(const Track& a, const Track& b) {
    double total = 0, weight = 0;
    const auto ag = genres(a.genre), bg = genres(b.genre);
    if (!ag.empty() && !bg.empty()) {
        std::size_t common = 0;
        for (const auto& g : ag) common += bg.count(g);
        total += .75 * static_cast<double>(common) / static_cast<double>(ag.size() + bg.size() - common);
        weight += .75;
    }
    const auto aa = label(a.artist), ba = label(b.artist);
    if (!aa.empty() && !ba.empty()) { total += .25 * (aa == ba ? 1.0 : 0.0); weight += .25; }
    return weight > 0 ? total / weight : unknown;
}

struct Scale { double magnitude = 1, spread = 0; };
using Corpus = std::vector<Scale>;
double quantile(const std::vector<double>& values, double fraction) {
    const double position = static_cast<double>(values.size() - 1) * fraction;
    const auto lower = static_cast<std::size_t>(position);
    const auto upper = std::min(lower + 1, values.size() - 1);
    return values[lower] + (values[upper] - values[lower]) * (position - static_cast<double>(lower));
}
Corpus scales(const std::vector<const Track*>& tracks) {
    std::size_t dimensions = 0;
    for (const auto* t : tracks) dimensions = std::max(dimensions, t->features.size());
    Corpus result(dimensions);
    for (std::size_t d = 0; d < dimensions; ++d) {
        auto& scale = result[d];
        scale.magnitude = 0;
        std::vector<double> values;
        for (const auto* t : tracks) if (d < t->features.size() && std::isfinite(t->features[d])) {
            values.push_back(t->features[d]);
            scale.magnitude = std::max(scale.magnitude, std::abs(t->features[d]));
        }
        if (scale.magnitude == 0) scale.magnitude = 1;
        if (values.size() < 2) continue;
        // Work in [-1,1] first, preventing overflow even for finite extreme inputs.
        for (auto& value : values) value /= scale.magnitude;
        std::sort(values.begin(), values.end());
        scale.spread = quantile(values, .75) - quantile(values, .25);
        if (scale.spread <= 0) scale.spread = values.back() - values.front();
    }
    return result;
}
double audio_similarity(const Track& a, const Track& b, const Corpus* corpus) {
    if (a.features.empty() || a.features.size() != b.features.size()) return unknown;
    double squared = 0;
    std::size_t valid = 0, varied = 0;
    for (std::size_t d = 0; d < a.features.size(); ++d) {
        const double av = a.features[d], bv = b.features[d];
        if (!std::isfinite(av) || !std::isfinite(bv)) continue;
        ++valid;
        double difference = 0;
        if (corpus) {
            const auto& s = (*corpus)[d];
            if (s.spread <= 0) continue; // Constant dimensions carry no style information.
            difference = (av / s.magnitude - bv / s.magnitude) / s.spread;
        } else {
            const double magnitude = std::max({1.0, std::abs(av), std::abs(bv)});
            difference = 2 * std::abs(av / magnitude - bv / magnitude)
                / (1 / magnitude + std::abs(av / magnitude) + std::abs(bv / magnitude));
        }
        difference = std::clamp(difference, -10.0, 10.0);
        squared += difference * difference;
        ++varied;
    }
    if (valid == 0) return unknown;
    return varied == 0 ? 1.0 : std::exp(-std::sqrt(squared / static_cast<double>(varied)));
}
double combined(const Track& a, const Track& b, const Corpus* corpus) {
    const double audio = audio_similarity(a, b, corpus), tags = tag_similarity(a, b);
    if (std::isfinite(audio)) return std::isfinite(tags) ? .8 * audio + .2 * tags : audio;
    return tags;
}
std::vector<const Track*> canonical(const std::vector<Track>& tracks) {
    std::map<std::string, const Track*> by_id;
    for (const auto& t : tracks) if (!t.id.empty()) by_id.emplace(t.id, &t);
    std::vector<const Track*> result;
    result.reserve(by_id.size());
    for (const auto& [id, t] : by_id) result.push_back(t);
    return result;
}
bool has_style_evidence(const std::vector<const Track*>& tracks) {
    std::size_t artists = 0, tagged_genres = 0;
    std::set<std::pair<std::size_t, std::size_t>> audio_dimensions;
    for (const auto* t : tracks) {
        if (!label(t->artist).empty() && ++artists > 1) return true;
        if (!genres(t->genre).empty() && ++tagged_genres > 1) return true;
        for (std::size_t d = 0; d < t->features.size(); ++d) if (std::isfinite(t->features[d]))
            if (!audio_dimensions.emplace(t->features.size(), d).second) return true;
    }
    return false;
}
std::vector<double> frequency_scores(const std::vector<const Track*>& tracks, const std::map<std::string, int>& recent) {
    std::vector<std::pair<double, std::size_t>> ranks;
    for (std::size_t i = 0; i < tracks.size(); ++i) {
        const auto it = recent.find(tracks[i]->id);
        const double r30 = it == recent.end() ? 0 : std::max(0, it->second);
        ranks.emplace_back(std::log1p(count(tracks[i]->play_count)) + 2 * std::log1p(r30), i);
    }
    std::sort(ranks.begin(), ranks.end());
    std::vector<double> result(tracks.size());
    if (tracks.size() < 2 || ranks.front().first == ranks.back().first) return result;
    for (std::size_t begin = 0; begin < ranks.size();) {
        std::size_t end = begin + 1;
        while (end < ranks.size() && ranks[end].first == ranks[begin].first) ++end;
        const double percentile = static_cast<double>(begin + end - 1) / static_cast<double>(tracks.size() - 1) - 1;
        for (auto i = begin; i < end; ++i) result[ranks[i].second] = percentile;
        begin = end;
    }
    return result;
}
double uniform(std::mt19937_64& rng) {
    // Exactly 52 random bits, strictly inside (0,1), independent of STL distributions.
    return (static_cast<double>(rng() >> 12) + .5) / 4503599627370496.0;
}
void unique_ids(std::vector<std::string>& ids) {
    std::unordered_set<std::string> present;
    ids.erase(std::remove_if(ids.begin(), ids.end(), [&](const auto& id) {
        return id.empty() || !present.insert(id).second;
    }), ids.end());
}
std::vector<std::string> read_ids(const nlohmann::json& object, const char* key) {
    std::vector<std::string> ids;
    const auto it = object.find(key);
    if (it != object.end() && it->is_array()) for (const auto& item : *it) if (item.is_string()) ids.push_back(item.get<std::string>());
    unique_ids(ids);
    return ids;
}
double read_coordinate(const nlohmann::json& object, const char* key) {
    const auto it = object.find(key);
    return it != object.end() && it->is_number() ? coordinate(it->get<double>()) : 0;
}
}

double similarity(const Track& a, const Track& b) { return combined(a, b, nullptr); }

std::vector<std::string> order(const std::vector<Track>& tracks, Point p, uint64_t seed,
                             const std::string& reference, const std::map<std::string, int>& recent, const Track* anchor) {
    const auto items = canonical(tracks);
    if (items.empty()) return {};
    auto acoustic_items = items;
    if (anchor && std::none_of(items.begin(), items.end(), [&](const auto* item) { return item->id == anchor->id; }))
        acoustic_items.push_back(anchor);
    p = normalized(p);
    if (p.y != 0 && !has_style_evidence(acoustic_items)) p.y = 0;
    std::mt19937_64 rng(seed);
    const auto frequencies = frequency_scores(items, recent);
    const Track* previous = anchor;
    if (!previous) for (const auto* item : items) if (item->id == reference) { previous = item; break; }
    const auto corpus = p.y != 0 ? scales(acoustic_items) : Corpus{};
    std::vector<std::string> result;
    result.reserve(items.size());
    // Exponential race: exact weighted sampling without replacement for static x.
    if (p.y == 0) {
        std::vector<std::pair<double, std::size_t>> keys;
        keys.reserve(items.size());
        for (std::size_t i = 0; i < items.size(); ++i)
            keys.emplace_back(-std::log(uniform(rng)) / std::exp(2.5 * p.x * frequencies[i]), i);
        std::sort(keys.begin(), keys.end());
        for (const auto& [key, i] : keys) result.push_back(items[i]->id);
        return result;
    }
    // Style weights change after each choice; resample the live distribution.
    std::vector<std::size_t> candidates(items.size());
    std::iota(candidates.begin(), candidates.end(), 0);
    std::vector<double> weights(items.size());
    while (!candidates.empty()) {
        double total = 0;
        for (std::size_t c = 0; c < candidates.size(); ++c) {
            const auto i = candidates[c];
            const double style = previous ? combined(*previous, *items[i], &corpus) : unknown;
            const double exponent = 2.5 * p.x * frequencies[i] - (std::isfinite(style) ? 3 * p.y * (2 * style - 1) : 0);
            total += weights[c] = std::exp(exponent);
        }
        double target = uniform(rng) * total;
        std::size_t selected = candidates.size() - 1;
        for (std::size_t c = 0; c < candidates.size(); ++c) {
            target -= weights[c];
            if (target < 0) { selected = c; break; }
        }
        previous = items[candidates[selected]];
        result.push_back(previous->id);
        candidates.erase(candidates.begin() + static_cast<std::ptrdiff_t>(selected));
    }
    return result;
}

void reconcile(Round& round, const std::vector<Track>& tracks, uint64_t seed, const std::map<std::string, int>& recent) {
    round.preference = normalized(round.preference);
    if (round.number == 0) round.number = 1;
    unique_ids(round.seen);
    unique_ids(round.remaining);
    const std::unordered_set<std::string> seen(round.seen.begin(), round.seen.end());
    std::unordered_set<std::string> live;
    for (const auto& t : tracks) if (!t.id.empty()) live.insert(t.id);
    round.remaining.erase(std::remove_if(round.remaining.begin(), round.remaining.end(), [&](const auto& id) {
        return !live.count(id) || seen.count(id);
    }), round.remaining.end());
    const std::unordered_set<std::string> pending(round.remaining.begin(), round.remaining.end());
    bool has_new = false;
    for (const auto& id : live) if (!pending.count(id) && !seen.count(id)) { has_new = true; break; }
    if (!has_new) return;
    const auto weighted = order(tracks, round.preference, seed, round.last, recent);
    std::vector<std::vector<std::string>> gaps(round.remaining.size() + 1);
    std::size_t gap = 0;
    for (const auto& id : weighted) {
        if (pending.count(id)) ++gap;
        else if (!seen.count(id)) gaps[gap].push_back(id);
    }
    std::vector<std::string> merged;
    merged.reserve(live.size());
    for (std::size_t i = 0; i < gaps.size(); ++i) {
        merged.insert(merged.end(), gaps[i].begin(), gaps[i].end());
        if (i < round.remaining.size()) merged.push_back(round.remaining[i]);
    }
    round.remaining = std::move(merged);
}

void begin_round(Round& round, const std::vector<Track>& tracks, uint64_t seed, const std::map<std::string, int>& recent) {
    if (round.number < std::numeric_limits<uint64_t>::max()) ++round.number;
    round.preference = normalized(round.preference);
    round.seen.clear();
    round.remaining = order(tracks, round.preference, seed, round.last, recent);
    if (round.remaining.size() > 1 && round.remaining.front() == round.last) std::swap(round.remaining[0], round.remaining[1]);
}

void consume(Round& round, const std::string& id) {
    if (id.empty()) return;
    const std::string chosen = id; // The caller may pass round.remaining.front().
    round.remaining.erase(std::remove(round.remaining.begin(), round.remaining.end(), chosen), round.remaining.end());
    if (std::find(round.seen.begin(), round.seen.end(), chosen) == round.seen.end()) round.seen.push_back(chosen);
    round.last = chosen;
}

void to_json(nlohmann::json& j, const Point& point) {
    const auto p = normalized(point);
    j = nlohmann::json{{"x", p.x}, {"y", p.y}};
}
void from_json(const nlohmann::json& j, Point& p) {
    p = {};
    if (j.is_object()) p = {read_coordinate(j, "x"), read_coordinate(j, "y")};
}
void to_json(nlohmann::json& j, const Round& round) {
    j = nlohmann::json{{"number", std::max(uint64_t{1}, round.number)}, {"preference", round.preference},
        {"remaining", round.remaining}, {"seen", round.seen}, {"last", round.last}};
}
void from_json(const nlohmann::json& j, Round& round) {
    round = {};
    if (!j.is_object()) return;
    const auto number = j.find("number");
    if (number != j.end()) {
        if (number->is_number_unsigned()) round.number = std::max(uint64_t{1}, number->get<uint64_t>());
        else if (number->is_number_integer() && number->get<int64_t>() > 0) round.number = static_cast<uint64_t>(number->get<int64_t>());
    }
    const auto p = j.find("preference");
    if (p != j.end()) from_json(*p, round.preference);
    round.seen = read_ids(j, "seen");
    round.remaining = read_ids(j, "remaining");
    const std::unordered_set<std::string> seen(round.seen.begin(), round.seen.end());
    round.remaining.erase(std::remove_if(round.remaining.begin(), round.remaining.end(), [&](const auto& id) { return seen.count(id) != 0; }), round.remaining.end());
    const auto last = j.find("last");
    if (last != j.end() && last->is_string()) round.last = last->get<std::string>();
}
}
