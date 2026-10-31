# Core task requirements

Implement only `src/core.hpp`, `src/core.cpp`, `tests/core_tests.cpp`. Do not edit other files. No subagents. Use C++20 and nlohmann JSON from `vendor/json.hpp` (include `"json.hpp"`). Parent will build MSVC and integrate into foobar SDK. Write tests first and run compile/test via VS2022 tools available in C:/Program Files/Microsoft Visual Studio/2022/Community. Tests standalone console assert/check, meaningful behavioral coverage.

Namespace `ss`. Interface lock (parent consumes these):
```
struct Track { std::string id,title,artist,genre; double duration=0,play_count=0; std::vector<double> features; };
struct Point { double x=0,y=0; }; // y positive UP jump; negative DOWN similarity
struct Round { uint64_t number=1; Point preference; std::vector<std::string> remaining,seen; std::string last; };
std::vector<std::string> order(const std::vector<Track>& tracks, Point p, uint64_t seed, const std::string& reference, const std::map<std::string,int>& recent);
void reconcile(Round& round,const std::vector<Track>& tracks,uint64_t seed,const std::map<std::string,int>& recent);
void begin_round(Round& round,const std::vector<Track>& tracks,uint64_t seed,const std::map<std::string,int>& recent);
void consume(Round& round,const std::string& id);
double similarity(const Track&,const Track&); // 0..1 or NaN unknown
void to_json(nlohmann::json&,const Point&); void from_json(const nlohmann::json&,Point&);
void to_json(nlohmann::json&,const Round&); void from_json(const nlohmann::json&,Round&);
```
Can add helpers or types but don't change these. frequency log1p(C)+2log1p(R30) percentile ties equal neutral; no-replacement weighted random ordering, x right prefers frequent, x left infrequent. y up jumps between styles, down similar relative to previous selected track. Unknown features and tags neutral. Acoustic distance groups should be normalized robustly so real librosa MFCC/chroma/rhythm heterogeneous features yield meaningful results. Can standardize corpus dimensions for distance; similarity() direct meaningful bounded measure. Labels supplement audio ~20%, audio 80% when both exist; only labels if no audio; missing labels neutral. Deterministic seed, continuous coordinates, center uniform. Reject/normalize NaN/inf points and counts. Round preserve seen on reconcile, add missing new songs weighted into remaining, remove deleted, don't disturb pending order unless edits require, dedup by track id. begin_round avoids last->first when n>1. consume inserts into seen once, removes from remaining, updates last; can consume already seen intentional replay safely.

Test full coverage empty/1/2/large, reproducibility, statistically x directions and y directions over many seeds, mixed corner, neutral missing metadata, equal count neutrality, added/deleted/reordered tracks, round boundary, JSON restart, corrupt values. Parent handles preview revision lifecycle in adapter. Report implementation and tests in `docs/task-core-report.md`. Do not commit to avoid shared repository races. Return short report.
