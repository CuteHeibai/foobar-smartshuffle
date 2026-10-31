#include "core.hpp"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
int checks = 0;
#define CHECK(expr) do { ++checks; if (!(expr)) throw std::runtime_error(std::string(__func__) + ": " #expr); } while (false)
ss::Track track(std::string id, double count = 0, std::vector<double> features = {}, std::string genre = {}) {
    ss::Track t; t.id = std::move(id); t.play_count = count; t.features = std::move(features); t.genre = std::move(genre); return t;
}
void permutation(const std::vector<std::string>& ids, std::size_t size) {
    CHECK(ids.size() == size); CHECK(std::set<std::string>(ids.begin(), ids.end()).size() == size);
}
void empty_singleton_and_duplicate_ids() {
    CHECK(ss::order({}, {}, 0, "", {}).empty());
    auto a = track("a");
    CHECK(ss::order({a}, {1, -1}, 3, "a", {}) == std::vector<std::string>{"a"});
    CHECK(ss::order({a, a, track("")}, {}, 1, "", {}) == std::vector<std::string>{"a"});
}
void reproducibility_and_input_reorder() {
    std::vector<ss::Track> tracks;
    for (int i = 0; i < 40; ++i) tracks.push_back(track(std::to_string(i), i, {double(i), double(i % 4)}));
    const auto ordered = ss::order(tracks, {.4, -.7}, 42, "1", {});
    permutation(ordered, 40);
    CHECK(ss::order(tracks, {.4, -.7}, 42, "1", {}) == ordered);
    std::reverse(tracks.begin(), tracks.end());
    CHECK(ss::order(tracks, {.4, -.7}, 42, "1", {}) == ordered);
    CHECK(ss::order(tracks, {.4, -.7}, 43, "1", {}) != ordered);
}
void center_and_equal_counts_are_neutral() {
    std::vector<ss::Track> tracks{track("a"), track("b"), track("c"), track("d")};
    int first[4]{};
    for (uint64_t seed = 0; seed < 4000; ++seed) {
        const auto neutral = ss::order(tracks, {}, seed, "", {});
        ++first[neutral.front()[0] - 'a'];
        CHECK(ss::order(tracks, {1, 1}, seed, "", {}) == neutral);
        CHECK(ss::order(tracks, {-1, -1}, seed, "", {}) == neutral);
        CHECK(ss::order(tracks, {1, 0}, seed, "", {{"a", 4}, {"b", 4}, {"c", 4}, {"d", 4}}) == neutral);
    }
    for (int value : first) CHECK(value > 800 && value < 1200);
}
void frequency_directions_and_continuity() {
    const std::vector<ss::Track> tracks{track("low", 0), track("middle", 10), track("high", 1000)};
    double means[5]{};
    const double points[]{-1, -.5, 0, .5, 1};
    for (int point = 0; point < 5; ++point) for (uint64_t seed = 0; seed < 3000; ++seed) {
        const auto id = ss::order(tracks, {points[point], 0}, seed, "", {}).front();
        means[point] += id == "high" ? 2 : id == "middle" ? 1 : 0;
    }
    for (int point = 1; point < 5; ++point) CHECK(means[point] > means[point - 1] + 300);
    CHECK(means[0] / 3000 < .3); CHECK(means[4] / 3000 > 1.7);
    int recent_wins = 0;
    for (uint64_t seed = 0; seed < 1000; ++seed)
        recent_wins += ss::order({track("historical", 100), track("recent", 0)}, {1, 0}, seed, "", {{"recent", 20}}).front() == "recent";
    CHECK(recent_wins > 900); // 2*log(21) exceeds log(101).
}
void tied_frequency_is_equal() {
    std::vector<ss::Track> tracks{track("a", 5), track("b", 5), track("c", 100)};
    int a = 0, b = 0;
    for (uint64_t seed = 0; seed < 5000; ++seed) {
        auto result = ss::order(tracks, {-1, 0}, seed, "", {});
        a += result.front() == "a"; b += result.front() == "b";
    }
    CHECK(std::abs(a - b) < 250); CHECK(a + b > 4500);
}
void similarity_audio_labels_and_missing() {
    auto a = track("a", 0, {100, 0, -2}, "Rock"); a.artist = "Alice";
    auto b = a; b.id = "b";
    CHECK(std::abs(ss::similarity(a, b) - 1) < 1e-9);
    b.features = {-100, 1, 20}; b.genre = "Classical"; b.artist = "Bob";
    CHECK(ss::similarity(a, b) >= 0 && ss::similarity(a, b) < .6);
    auto same_audio_other_tags = a; same_audio_other_tags.genre = "Jazz"; same_audio_other_tags.artist = "Bob";
    CHECK(std::abs(ss::similarity(a, same_audio_other_tags) - .8) < 1e-9);
    auto labels_only = track("c", 0, {}, " rock "); labels_only.artist = " ALICE ";
    CHECK(std::abs(ss::similarity(a, labels_only) - 1) < 1e-9);
    auto unknown = track("unknown"); unknown.title = "Rock"; unknown.duration = 300;
    CHECK(std::isnan(ss::similarity(a, unknown)));
    CHECK(std::isnan(ss::similarity(unknown, unknown)));
    auto corrupt = track("bad", 0, {std::numeric_limits<double>::quiet_NaN(), std::numeric_limits<double>::infinity()});
    CHECK(std::isnan(ss::similarity(corrupt, corrupt)));
    CHECK(std::abs(ss::similarity(a, b) - ss::similarity(b, a)) < 1e-12);
}
void vertical_directions_use_previous_track() {
    const std::vector<ss::Track> tracks{
        track("a", 0, {0, 0}), track("b", 0, {.01, 0}),
        track("c", 0, {100, 1}), track("d", 0, {100.01, 1})};
    auto transitions = [](const std::vector<std::string>& ids) {
        int jumps = 0;
        for (std::size_t i = 1; i < ids.size(); ++i) jumps += (ids[i - 1] <= "b") != (ids[i] <= "b");
        return jumps;
    };
    double down = 0, up = 0;
    int down_first_near = 0, up_first_far = 0;
    for (uint64_t seed = 0; seed < 2000; ++seed) {
        const auto d = ss::order(tracks, {0, -1}, seed, "a", {});
        const auto u = ss::order(tracks, {0, 1}, seed, "a", {});
        down += transitions(d); up += transitions(u);
        down_first_near += d.front() <= "b"; up_first_far += u.front() >= "c";
    }
    CHECK(up - down > 1800); CHECK(down_first_near > 1800); CHECK(up_first_far > 1800);
}
void heterogeneous_audio_scale_and_mixed_corner() {
    const std::vector<ss::Track> tracks{
        track("reference", 0, {0, 0, 0}), track("near", 0, {.001, 0, 0}),
        track("far_frequent", 1000, {100000, 1, .01}), track("far_rare", 0, {100001, 1, .01})};
    auto rescaled = tracks;
    for (auto& t : rescaled) t.features[0] *= 10000;
    int corner_wins = 0;
    for (uint64_t seed = 0; seed < 1000; ++seed) {
        const auto original = ss::order(tracks, {1, 1}, seed, "reference", {});
        CHECK(ss::order(rescaled, {1, 1}, seed, "reference", {}) == original);
        corner_wins += original.front() == "far_frequent";
    }
    CHECK(corner_wins > 900);
}
void separate_anchor_is_reference_only() {
    const auto anchor = track("anchor", 1e9, {0, 0}, "Rock");
    const std::vector<ss::Track> pending{track("near", 0, {.01, 0}, "Rock"), track("far", 100, {100, 1}, "Jazz")};
    int down_near = 0, up_far = 0;
    for (uint64_t seed = 0; seed < 2000; ++seed) {
        // Explicit anchor must override the legacy in-corpus reference string.
        const auto down = ss::order(pending, {0, -1}, seed, "far", {}, &anchor);
        const auto up = ss::order(pending, {0, 1}, seed, "", {}, &anchor);
        permutation(down, 2); permutation(up, 2);
        CHECK(std::find(down.begin(), down.end(), "anchor") == down.end());
        down_near += down.front() == "near"; up_far += up.front() == "far";
        CHECK(ss::order(pending, {1, 0}, seed, "", {}, &anchor) == ss::order(pending, {1, 0}, seed, "", {}));
    }
    CHECK(down_near > 1900); CHECK(up_far > 1900);
    const auto distant = track("distant", 0, {100});
    const std::vector<ss::Track> sparse{track("known", 0, {0}), track("unknown")};
    int known_first = 0;
    for (uint64_t seed = 0; seed < 1000; ++seed)
        known_first += ss::order(sparse, {0, -1}, seed, "", {}, &distant).front() == "known";
    CHECK(known_first < 200); // Anchor must join scaling; a constant candidate dimension is not identical to it.
}
void corrupt_numeric_inputs_are_normalized() {
    const double nan = std::numeric_limits<double>::quiet_NaN(), inf = std::numeric_limits<double>::infinity();
    std::vector<ss::Track> tracks{track("a", nan), track("b", inf), track("c", -10)};
    auto clean = tracks; for (auto& t : clean) t.play_count = 0;
    CHECK(ss::order(tracks, {nan, inf}, 99, "", {{"a", -20}}) == ss::order(clean, {}, 99, "", {}));
    CHECK(ss::order(clean, {100, -100}, 89, "", {}) == ss::order(clean, {1, -1}, 89, "", {}));
}
void rounds_preserve_history_and_pending_order() {
    ss::Round r; r.remaining = {"b", "a", "b", "deleted", "seen"}; r.seen = {"seen", "seen"}; r.last = "seen";
    std::vector<ss::Track> tracks{track("a"), track("b"), track("seen"), track("new")};
    ss::reconcile(r, tracks, 20, {});
    CHECK(r.seen == std::vector<std::string>{"seen"}); permutation(r.remaining, 3);
    CHECK(std::find(r.remaining.begin(), r.remaining.end(), "b") < std::find(r.remaining.begin(), r.remaining.end(), "a"));
    const auto pending = r.remaining;
    std::reverse(tracks.begin(), tracks.end()); ss::reconcile(r, tracks, 90, {});
    CHECK(r.remaining == pending); CHECK(r.last == "seen"); CHECK(r.number == 1);
    ss::consume(r, "b"); CHECK(r.last == "b"); CHECK(r.seen == (std::vector<std::string>{"seen", "b"}));
    CHECK(std::find(r.remaining.begin(), r.remaining.end(), "b") == r.remaining.end());
    ss::consume(r, "seen"); CHECK(r.last == "seen"); CHECK(r.seen == (std::vector<std::string>{"seen", "b"}));
    ss::consume(r, ""); CHECK(r.last == "seen");
    ss::reconcile(r, {track("a"), track("new")}, 3, {});
    CHECK(r.seen == (std::vector<std::string>{"seen", "b"}));
}
void consuming_pending_reference_is_safe() {
    ss::Round r; r.remaining = {"a", "b", "c"};
    ss::consume(r, r.remaining.front());
    CHECK(r.last == "a"); CHECK(r.seen == std::vector<std::string>{"a"});
    CHECK(r.remaining == (std::vector<std::string>{"b", "c"}));
}
void newly_added_tracks_receive_weighted_positions() {
    int high_first = 0, low_first = 0;
    for (uint64_t seed = 0; seed < 2000; ++seed) {
        ss::Round high; high.preference = {1, 0}; high.remaining = {"a", "b"};
        auto low = high; low.preference.x = -1;
        const std::vector<ss::Track> tracks{track("a"), track("b"), track("new", 1000)};
        ss::reconcile(high, tracks, seed, {}); ss::reconcile(low, tracks, seed, {});
        high_first += high.remaining.front() == "new"; low_first += low.remaining.front() == "new";
    }
    CHECK(high_first > 1700); CHECK(low_first < 200);
}
void round_boundary_and_exhaustion() {
    ss::Round r; r.last = "a"; r.seen = {"a", "b"};
    const std::vector<ss::Track> tracks{track("a"), track("b")};
    ss::reconcile(r, tracks, 0, {}); CHECK(r.remaining.empty()); CHECK(r.number == 1);
    for (uint64_t seed = 0; seed < 100; ++seed) {
        ss::begin_round(r, tracks, seed, {}); CHECK(r.seen.empty()); CHECK(r.remaining == (std::vector<std::string>{"b", "a"}));
    }
    CHECK(r.number == 101);
    ss::begin_round(r, {track("a")}, 9, {}); CHECK(r.remaining == std::vector<std::string>{"a"});
    ss::begin_round(r, {}, 0, {}); CHECK(r.remaining.empty());
    r.number = std::numeric_limits<uint64_t>::max(); ss::begin_round(r, {}, 0, {}); CHECK(r.number == std::numeric_limits<uint64_t>::max());
}
void json_restart_and_corruption() {
    ss::Round r; r.number = 19; r.preference = {.25, -.75}; r.remaining = {"b", "c"}; r.seen = {"a"}; r.last = "a";
    const auto restored = nlohmann::json::parse(nlohmann::json(r).dump()).get<ss::Round>();
    CHECK(restored.number == 19); CHECK(restored.preference.x == .25 && restored.preference.y == -.75);
    CHECK(restored.remaining == r.remaining && restored.seen == r.seen && restored.last == "a");
    auto resumed = restored; ss::reconcile(resumed, {track("c"), track("a"), track("b")}, 100, {}); CHECK(resumed.remaining == r.remaining);
    ss::Round bad = nlohmann::json::parse(R"({"number":-1,"preference":{"x":99,"y":"bad"},"remaining":["a","a",null,3,"b",""],"seen":["b","b"],"last":true})").get<ss::Round>();
    CHECK(bad.number == 1 && bad.preference.x == 1 && bad.preference.y == 0);
    CHECK(bad.remaining == std::vector<std::string>{"a"}); CHECK(bad.seen == std::vector<std::string>{"b"}); CHECK(bad.last.empty());
    auto nil = nlohmann::json(nullptr).get<ss::Round>(); CHECK(nil.number == 1 && nil.remaining.empty());
    const auto p = nlohmann::json{{"x", std::numeric_limits<double>::infinity()}, {"y", -.5}}.get<ss::Point>();
    CHECK(p.x == 0 && p.y == -.5);
    ss::Point p2{std::numeric_limits<double>::quiet_NaN(), 5};
    CHECK(nlohmann::json(p2).at("x") == 0 && nlohmann::json(p2).at("y") == 1);
}
void large_round_no_replacement() {
    std::vector<ss::Track> tracks;
    for (int i = 0; i < 5000; ++i) tracks.push_back(track(std::to_string(i), i));
    permutation(ss::order(tracks, {1, 0}, 3, "", {}), 5000);
    tracks.resize(300); for (std::size_t i = 0; i < tracks.size(); ++i) tracks[i].features = {double(i), double(i % 5)};
    permutation(ss::order(tracks, {.2, -.4}, 2, "0", {}), 300);
}
}
int main() {
    const std::pair<const char*, void(*)()> tests[]{
        {"empty/singleton/duplicates", empty_singleton_and_duplicate_ids},
        {"reproducibility/reorder", reproducibility_and_input_reorder},
        {"uniform center/equal counts/missing metadata", center_and_equal_counts_are_neutral},
        {"frequency directions/continuity/recent", frequency_directions_and_continuity},
        {"frequency ties", tied_frequency_is_equal},
        {"similarity/audio/labels/missing", similarity_audio_labels_and_missing},
        {"vertical directions/previous selection", vertical_directions_use_previous_track},
        {"acoustic scale/mixed corner", heterogeneous_audio_scale_and_mixed_corner},
        {"separate nonselectable anchor", separate_anchor_is_reference_only},
        {"corrupt numeric values", corrupt_numeric_inputs_are_normalized},
        {"round reconcile/consume", rounds_preserve_history_and_pending_order},
        {"consume aliased pending id", consuming_pending_reference_is_safe},
        {"weighted additions", newly_added_tracks_receive_weighted_positions},
        {"round boundary", round_boundary_and_exhaustion},
        {"JSON restart/corruption", json_restart_and_corruption},
        {"large permutations", large_round_no_replacement}
    };
    int failures = 0;
    for (const auto& [name, test] : tests) {
        try { test(); std::cout << "PASS " << name << '\n'; }
        catch (const std::exception& e) { ++failures; std::cerr << "FAIL " << name << ": " << e.what() << '\n'; }
    }
    std::cout << std::size(tests) - failures << '/' << std::size(tests) << " test groups, " << checks << " checks\n";
    return failures ? 1 : 0;
}
