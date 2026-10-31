#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <vector>
#include "json.hpp"

namespace ss {
struct Track { std::string id, title, artist, genre; double duration = 0, play_count = 0; std::vector<double> features; };
// Coordinates are continuous in [-1,1]: right=frequent, up=style jumps.
struct Point { double x = 0, y = 0; };
struct Round { uint64_t number = 1; Point preference; std::vector<std::string> remaining, seen; std::string last; };
// Optional anchor is a nonselectable first reference, also used for audio scaling.
// Only tracks supplies candidates and frequency ranks; anchor overrides reference.
std::vector<std::string> order(const std::vector<Track>& tracks, Point p, uint64_t seed, const std::string& reference, const std::map<std::string, int>& recent, const Track* anchor = nullptr);
void reconcile(Round& round, const std::vector<Track>& tracks, uint64_t seed, const std::map<std::string, int>& recent);
// Fresh Round starts at 1 via reconcile; begin_round advances to the next round.
void begin_round(Round& round, const std::vector<Track>& tracks, uint64_t seed, const std::map<std::string, int>& recent);
void consume(Round& round, const std::string& id);
double similarity(const Track&, const Track&);
void to_json(nlohmann::json&, const Point&);
void from_json(const nlohmann::json&, Point&);
void to_json(nlohmann::json&, const Round&);
void from_json(const nlohmann::json&, Round&);
}
