#pragma once
#include "json.hpp"
#include <filesystem>
#include <fstream>
#include <thread>
#include <mutex>
#include <deque>
#include <atomic>
#include <chrono>

namespace native_ss {
// All network, dictionary work and local indexing happens outside the UI thread.
class MetadataWorker {
    using json=nlohmann::json;
    std::filesystem::path root;
    std::mutex mutex;
    std::deque<json> pending;
    std::vector<json> completed;
    std::atomic_bool stopping=false;
    std::atomic_bool covering=false,yieldCover=false;
    std::thread worker;
public:
    explicit MetadataWorker(std::filesystem::path p):root(std::move(p)),worker([this]{run();}){}
    ~MetadataWorker(){stopping=true;if(worker.joinable())worker.join();}
    void enqueue(json request){std::lock_guard lock(mutex);auto task=request.value("task",std::string{});if(task=="search"||task=="artist_auto")std::erase_if(pending,[&](const json& j){return j.value("task",std::string{})==task;});if(task!="covers"){if(covering)yieldCover=true;pending.push_front(std::move(request));}else pending.push_back(std::move(request));}
    std::vector<json> results(){std::lock_guard lock(mutex);std::vector<json> out;out.swap(completed);return out;}
private:
    void run(){
        SetThreadPriority(GetCurrentThread(),THREAD_PRIORITY_BELOW_NORMAL);
        while(!stopping){
            json request;
            {std::lock_guard lock(mutex);if(!pending.empty()){request=std::move(pending.front());pending.pop_front();yieldCover=false;covering=request.value("task",std::string{})=="covers";}}
            if(request.is_null()){std::this_thread::sleep_for(std::chrono::milliseconds(40));continue;}
            json result={{"id",request.value("id",std::string{})},{"task",request.value("task",std::string{})},{"pending",false}};
            auto input=root/L"metadata-job.json",output=root/L"metadata-result.json";
            bool interrupted=false;try{
                auto exe=root/L"runtime"/L"smartshuffle-analyzer"/L"smartshuffle-analyzer.exe";
                if(!std::filesystem::exists(exe))throw std::runtime_error("本地搜索工具未安装");
                {std::ofstream file(input,std::ios::binary);file<<request.dump();if(!file)throw std::runtime_error("无法保存搜索请求");}
                std::error_code ec;std::filesystem::remove(output,ec);
                auto command=L"\""+exe.wstring()+L"\" --metadata --input \""+input.wstring()+L"\" --output \""+output.wstring()+L"\"";
                STARTUPINFOW si{};si.cb=sizeof(si);PROCESS_INFORMATION pi{};
                if(!CreateProcessW(exe.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW|BELOW_NORMAL_PRIORITY_CLASS,nullptr,root.c_str(),&si,&pi))throw std::runtime_error("无法启动搜索工具");
                CloseHandle(pi.hThread);auto began=std::chrono::steady_clock::now();
                while(WaitForSingleObject(pi.hProcess,80)==WAIT_TIMEOUT){
                    if(covering&&yieldCover&&!stopping){TerminateProcess(pi.hProcess,1);WaitForSingleObject(pi.hProcess,2000);CloseHandle(pi.hProcess);interrupted=true;throw std::runtime_error("封面任务让出后台工具");}
                    if(stopping||std::chrono::steady_clock::now()-began>std::chrono::minutes(4)){TerminateProcess(pi.hProcess,1);WaitForSingleObject(pi.hProcess,2000);CloseHandle(pi.hProcess);throw std::runtime_error("搜索任务已停止或超时");}
                }
                DWORD code=0;GetExitCodeProcess(pi.hProcess,&code);CloseHandle(pi.hProcess);
                std::ifstream file(output,std::ios::binary);json data;file>>data;
                if(code||!data.value("ok",false))throw std::runtime_error(data.value("error",std::string("搜索或联网核验失败")));
                result["ok"]=true;result["result"]=data.at("result");
            }catch(const std::exception& e){result["ok"]=false;result["error"]=e.what();}
            std::error_code ec;std::filesystem::remove(input,ec);std::filesystem::remove(output,ec);
            {std::lock_guard lock(mutex);covering=false;if(interrupted)pending.push_back(std::move(request));else completed.push_back(std::move(result));}
        }
    }
};
}
