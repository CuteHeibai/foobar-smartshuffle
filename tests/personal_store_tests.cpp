#include "personal_store.hpp"
#include <functional>
#include <iostream>
#include <limits>
#include <stdexcept>
using nlohmann::json;
using ss::PersonalStore;
namespace {
int passed = 0, failed = 0;
constexpr int64_t now = 2000000000;
constexpr int64_t days90 = 90 * 24 * 60 * 60;
json track(std::string id = "a", double duration = 120) {
    return {{"id", id}, {"title", "Title " + id}, {"artist", "Artist"}, {"album", "Album"}, {"duration", duration}};
}
void expect(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
template<class F> void rejects(F f) {
    try { f(); } catch (const std::invalid_argument&) { return; }
    throw std::runtime_error("expected invalid_argument");
}
void test(const char* name, const std::function<void()>& body) {
    try { body(); ++passed; std::cout << "PASS " << name << '\n'; }
    catch (const std::exception& e) { ++failed; std::cerr << "FAIL " << name << ": " << e.what() << '\n'; }
}
json item(const PersonalStore& s, const std::string& kind, size_t offset = 0) { return s.page(kind, offset, 1).at("items").at(0); }
}
int main() {
    test("empty summary and pages expose the versioned personal contract", [] {
        PersonalStore s;
        expect(s.summary("") == json{{"revision", 0}, {"history_count", 0}, {"favorites_count", 0}, {"later_count", 0}, {"now_favorite", false}, {"now_later", false}}, "empty summary");
        expect(s.page("history", 0, 50) == json{{"kind", "history"}, {"offset", 0}, {"total", 0}, {"revision", 0}, {"items", json::array()}}, "empty page");
        expect(s.dump().at("version") == 1 && !s.active(), "initial version");
    });
    test("explicit membership batches deduplicate and do not toggle", [] {
        PersonalStore s;
        expect(s.set("favorites", {track("a"), track("a"), track("b")}, true, now), "first set");
        auto revision = s.revision(); auto before = s.page("favorites", 0, 100);
        expect(before.at("total") == 2 && item(s, "favorites").at("id") == "b", "newest first and unique");
        expect(!s.set("favorites", {track("a")}, true, now + 50), "repeat true no-op");
        expect(s.revision() == revision && s.page("favorites", 0, 100) == before, "repeat preserves added_at order and revision");
        expect(s.set("favorites", {track("a"), track("a")}, false, now + 60) && !s.contains("favorites", "a"), "remove duplicates once");
        expect(!s.set("favorites", {track("missing")}, false, now + 61), "missing removal no-op");
        expect(s.set("favorites", {track("a")}, true, now + 70) && item(s, "favorites").at("added_at") == now + 70, "re-add becomes newest");
    });
    test("favorites and later are independent and later survives playback", [] {
        PersonalStore s;
        s.set("favorites", {track()}, true, now); s.set("later", {track()}, true, now);
        s.begin(track(), now); s.listen(120); s.finish("ended", now + 120);
        expect(s.summary("a").at("now_favorite") && s.summary("a").at("now_later"), "current flags");
        s.set("favorites", {track()}, false, now + 121);
        expect(!s.contains("favorites", "a") && s.contains("later", "a"), "independent memberships");
        expect(s.flags({"a", "missing"}) == json::array({{{"id", "a"}, {"favorite", false}, {"later", true}}, {{"id", "missing"}, {"favorite", false}, {"later", false}}}), "batch flags");
    });
    test("pages clamp the limit and handle offset overflow safely", [] {
        PersonalStore s; std::vector<json> tracks;
        for (int i = 0; i < 150; ++i) tracks.push_back(track(std::to_string(i)));
        s.set("later", tracks, true, now);
        expect(s.page("later", 0, 1000).at("items").size() == 100, "maximum page");
        expect(s.page("later", 100, 100).at("items").size() == 50 && item(s, "later", 100).at("id") == "49", "second page");
        expect(s.page("later", std::numeric_limits<size_t>::max(), 100).at("items").empty(), "overflow offset");
        expect(s.page("later", 0, 0).at("items").empty(), "zero limit");
        rejects([&] { s.flags(std::vector<std::string>(257, "a")); });
    });
    test("membership has no artificial small collection ceiling", [] {
        PersonalStore s; std::vector<json> tracks;
        for (int i = 0; i < 10020; ++i) tracks.push_back(track(std::to_string(i)));
        s.set("favorites", tracks, true, now);
        expect(s.summary("").at("favorites_count") == 10020, "all favorites kept");
        PersonalStore reloaded; reloaded.load(s.dump(), now);
        expect(reloaded.contains("favorites", "0") && reloaded.contains("favorites", "10019"), "large collection reload");
    });
    test("wall clock and seeks never fabricate listening time", [] {
        PersonalStore s; s.begin(track(), now); auto rev = s.revision();
        s.listen(4.25); s.listen(5.75);
        expect(s.revision() == rev && item(s, "history").at("listened") == 10, "listen does not churn revision");
        s.finish("skipped", now + 8000);
        auto event = item(s, "history");
        expect(event.at("listened") == 10 && !event.at("qualified"), "elapsed wall time excluded");
        expect(event.at("started_at") == now && event.at("ended_at") == now + 8000 && event.at("outcome") == "skipped", "completed event");
        expect(!s.active() && s.revision() > rev, "finish publishes revision");
        rev = s.revision(); s.finish("stopped", now + 9000); s.listen(100);
        expect(s.revision() == rev && item(s, "history").at("listened") == 10, "idle callbacks no-op");
    });
    test("qualified threshold uses known half duration or sixty seconds", [] {
        PersonalStore s;
        s.begin(track("short", 40), now); s.listen(19.9); s.finish("skipped", now + 20);
        expect(!item(s, "history").at("qualified"), "below half");
        s.begin(track("short", 40), now + 21); s.listen(20); s.finish("stopped", now + 41);
        expect(item(s, "history").at("qualified"), "exact half");
        s.begin(track("long", 500), now + 42); s.listen(60); s.finish("ended", now + 102);
        expect(item(s, "history").at("qualified"), "long uses sixty");
        s.begin(track("unknown", 0), now + 103); s.listen(59.9); s.finish("stopped", now + 163);
        expect(!item(s, "history").at("qualified"), "unknown is not automatically qualified");
        s.begin(track("unknown", 0), now + 164); s.listen(60); s.finish("stopped", now + 224);
        expect(item(s, "history").at("qualified"), "unknown uses sixty");
    });
    test("nonfinite nonpositive and overflowing listen samples are ignored", [] {
        PersonalStore s; s.begin(track(), now);
        for (auto sample : {0., -3., std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity(), -std::numeric_limits<double>::infinity()}) s.listen(sample);
        expect(item(s, "history").at("listened") == 0, "invalid samples ignored");
        s.listen(std::numeric_limits<double>::max()); s.listen(std::numeric_limits<double>::max());
        expect(item(s, "history").at("listened").get<double>() == std::numeric_limits<double>::max(), "overflow ignored");
        expect(json::parse(s.dump().dump()).at("history").at(0).at("listened").is_number(), "finite dump");
    });
    test("repeated tracks create distinct events and begin interrupts existing event", [] {
        PersonalStore s; s.begin(track(), now); s.listen(5); auto first = item(s, "history").at("event_id");
        s.begin(track(), now + 6);
        expect(s.active() && s.page("history", 0, 100).at("total") == 2, "distinct events");
        expect(item(s, "history").at("event_id") != first && item(s, "history", 1).at("outcome") == "interrupted", "previous interrupted");
        expect(item(s, "history", 1).at("listened") == 5 && item(s, "history", 1).at("ended_at") == now + 6, "interrupted session accounting");
    });
    test("restart finalizes playing events without adding downtime and sequence survives", [] {
        PersonalStore s; s.set("later", {track()}, true, now); s.begin(track(), now); s.listen(11);
        auto oldId = item(s, "history").at("event_id").get<uint64_t>(); auto revision = s.revision();
        PersonalStore recovered; recovered.load(json::parse(s.dump().dump()), now + 100);
        expect(!recovered.active() && item(recovered, "history").at("outcome") == "interrupted", "playing recovers as interrupted");
        expect(item(recovered, "history").at("listened") == 11 && item(recovered, "history").at("ended_at") == now + 100 && recovered.revision() > revision, "no downtime listening");
        recovered.begin(track(), now + 101);
        expect(item(recovered, "history").at("event_id").get<uint64_t>() > oldId && recovered.contains("later", "a"), "sequence and membership preserved");
        recovered.finish("stopped", now + 102); auto saved = recovered.dump();
        PersonalStore roundtrip; roundtrip.load(saved, now + 103);
        expect(roundtrip.dump() == saved, "completed roundtrip is stable");
    });
    test("history retention keeps the ninety day boundary", [] {
        PersonalStore s;
        s.begin(track("old"), now - days90 - 1); s.finish("ended", now - days90 - 1);
        s.begin(track("edge"), now - days90); s.finish("ended", now - days90);
        s.set("favorites", {track("old")}, true, now - days90 - 1);
        PersonalStore reloaded; reloaded.load(s.dump(), now);
        expect(reloaded.page("history", 0, 100).at("total") == 1 && item(reloaded, "history").at("id") == "edge", "age boundary");
        expect(reloaded.contains("favorites", "old"), "membership never expires");
        reloaded.begin(track("new"), now + 1);
        expect(reloaded.page("history", 0, 100).at("total") == 1, "new begin applies age pruning");
    });
    test("history trims oldest events at ten thousand while retaining sequence", [] {
        PersonalStore s;
        for (int i = 0; i < 10003; ++i) { s.begin(track(std::to_string(i)), now + i); s.finish("ended", now + i); }
        expect(s.page("history", 0, 100).at("total") == 10000 && item(s, "history", 9999).at("id") == "3", "oldest three trimmed");
        PersonalStore reloaded; reloaded.load(s.dump(), now + 10003); reloaded.begin(track("new"), now + 10004);
        expect(item(reloaded, "history").at("event_id").get<uint64_t>() > 10003 && item(reloaded, "history", 9999).at("id") == "4", "trim reload sequence");
    });
    test("invalid kinds and malformed mutation inputs leave state untouched", [] {
        PersonalStore s; s.set("favorites", {track()}, true, now); auto saved = s.dump();
        rejects([&] { s.page("unknown", 0, 1); }); rejects([&] { s.contains("history", "a"); });
        rejects([&] { s.set("history", {track()}, true, now); });
        rejects([&] { s.set("later", {track("ok"), {{"id", ""}}}, true, now); });
        rejects([&] { s.begin(track("bad", std::numeric_limits<double>::quiet_NaN()), now); });
        rejects([&] { s.begin(track("bad", -1), now); }); rejects([&] { s.begin(track(), -1); });
        expect(s.dump() == saved, "failed batch and begin are atomic");
    });
    test("version and malformed persisted data are rejected without data loss", [] {
        PersonalStore s; s.set("favorites", {track()}, true, now); auto saved = s.dump();
        std::vector<json> invalid{nullptr, json::array(), json::object()};
        for (auto version : {0, 2, -1}) { auto bad = saved; bad["version"] = version; invalid.push_back(bad); }
        auto bad = saved; bad["version"] = "1"; invalid.push_back(bad);
        bad = saved; bad["favorites"] = "bad"; invalid.push_back(bad);
        bad = saved; bad["favorites"][0]["id"] = 3; invalid.push_back(bad);
        bad = saved; bad["favorites"][0]["duration"] = -1; invalid.push_back(bad);
        bad = saved; bad["favorites"].push_back(bad["favorites"][0]); invalid.push_back(bad);
        bad = saved; bad["revision"] = -1; invalid.push_back(bad);
        s.begin(track(), now); auto eventSaved = s.dump(); s.finish("stopped", now);
        bad = eventSaved; bad["history"][0]["listened"] = -1; invalid.push_back(bad);
        bad = eventSaved; bad["history"][0]["started_at"] = "today"; invalid.push_back(bad);
        bad = eventSaved; bad["history"].push_back(bad["history"][0]); invalid.push_back(bad);
        bad = eventSaved; bad["next_event_id"] = 1; invalid.push_back(bad);
        for (const auto& document : invalid) { auto before = s.dump(); rejects([&] { s.load(document, now); }); expect(s.dump() == before, "rejected load preserves all data"); }
    });
    std::cout << passed << " personal store checks passed; " << failed << " failed\n";
    return failed ? 1 : 0;
}
