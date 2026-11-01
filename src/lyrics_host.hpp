#pragma once
#include <memory>
#include "json.hpp"

namespace native_ss {
// Construct, update, query, and destroy on foobar2000's main thread.
class LyricsHost {
public:
    LyricsHost();
    ~LyricsHost();
    nlohmann::json update(const nlohmann::json& request);
    nlohmann::json status() const;
    void set_light(bool light);
    LyricsHost(const LyricsHost&) = delete;
    LyricsHost& operator=(const LyricsHost&) = delete;
private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};
}
