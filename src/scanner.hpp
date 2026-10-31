#pragma once
#include <foobar2000/SDK/foobar2000.h>
#include <filesystem>
#include <deque>
#include <mutex>
#include <thread>
#include <atomic>
#include "json.hpp"

namespace native_ss {
struct ScanJob { std::string id, fingerprint; metadb_handle_ptr handle; };
struct ScanResult { std::string id,fingerprint,error; std::vector<double> features; };
class Scanner {
public:
    explicit Scanner(std::filesystem::path root);
    ~Scanner();
    void enqueue(ScanJob job, bool priority=false);
    void pause(bool value) { paused=value; }
    std::vector<ScanResult> results();
    size_t pending();
    std::string current();
private:
    void run();
    ScanResult analyze(const ScanJob&);
    std::filesystem::path root;
    std::mutex mutex;
    std::deque<ScanJob> jobs;
    std::vector<ScanResult> finished;
    std::string active;
    std::atomic_bool stopping=false,paused=false;
    abort_callback_impl abort;
    std::thread thread;
};
}
