#pragma once
#include <array>
#include <chrono>
#include <filesystem>
#include <optional>
#include "json.hpp"
namespace native_ss {
class RecycleManager {
public:
    nlohmann::json prepare(const std::string& uri,const std::filesystem::path& path,bool shared);
    std::string apply(const std::string& token);
    std::string validate(const std::string& token);
    void cancel(){pending_.reset();}
private:
    struct Pending {std::string token,uri;std::filesystem::path path;std::array<uint64_t,5> stamp;std::chrono::steady_clock::time_point created;};
    std::optional<Pending> pending_;
};
}
