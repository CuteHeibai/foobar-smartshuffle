#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winhttp.h>
#include "update_policy.hpp"
#include "update_download.hpp"
#include <filesystem>
#include <fstream>
#include <future>
#include <chrono>
#pragma comment(lib,"winhttp.lib")
namespace native_ss {
inline nlohmann::json github_releases(){
    struct Handle {HINTERNET h;~Handle(){if(h)WinHttpCloseHandle(h);}operator HINTERNET()const{return h;}};
    Handle session{WinHttpOpen(L"foo_smartshuffle-update/1",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,nullptr,nullptr,0)};
    if(!session.h)throw std::runtime_error("无法初始化更新连接");WinHttpSetTimeouts(session,3000,3000,3000,3000);
    Handle connect{WinHttpConnect(session,L"api.github.com",INTERNET_DEFAULT_HTTPS_PORT,0)};
    if(!connect.h)throw std::runtime_error("无法连接 GitHub");
    Handle request{WinHttpOpenRequest(connect,L"GET",L"/repos/CuteHeibai/foobar-smartshuffle/releases?per_page=100",nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE)};
    if(!request.h)throw std::runtime_error("无法创建更新请求");
    const wchar_t* headers=L"Accept: application/vnd.github+json\r\nX-GitHub-Api-Version: 2022-11-28\r\n";
    if(!WinHttpSendRequest(request,headers,-1,nullptr,0,0,0)||!WinHttpReceiveResponse(request,nullptr))throw std::runtime_error("更新检查连接失败，请稍后重试");
    DWORD status=0,size=sizeof(status);if(!WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&size,nullptr))throw std::runtime_error("无法读取更新响应");
    if(status==403||status==429)throw std::runtime_error("GitHub 请求受限，请稍后重试");if(status!=200)throw std::runtime_error("GitHub 更新服务暂不可用");
    std::string body;char buffer[16384];auto begin=std::chrono::steady_clock::now();
    for(;;){DWORD read=0;if(!WinHttpReadData(request,buffer,sizeof(buffer),&read))throw std::runtime_error("更新信息读取失败");if(!read)break;body.append(buffer,read);
        if(body.size()>2*1024*1024||std::chrono::steady_clock::now()-begin>std::chrono::seconds(12))throw std::runtime_error("更新响应过大或超时");}
    auto result=nlohmann::json::parse(body);if(!result.is_array())throw std::runtime_error("更新信息格式无效");return result;
}
class Updater {
    using json=nlohmann::json;
    std::filesystem::path settings_,root_,fallback_,job_;std::string current_,edition_;std::future<json> work_,download_;bool automatic_=true;
    json state_;std::shared_ptr<UpdateProgress> progress_;uint64_t reportedBytes_=0;HANDLE helper_=nullptr;
    static json read(const std::filesystem::path& path){try{std::ifstream in(path);if(in){auto result=json::parse(in);if(result.is_object())return result;}}catch(...){}return json::object();}
    static std::string result_error(const json& result){auto error=result.value("error",json{});return error.is_string()?error.get<std::string>():std::string("更新未完成，请重试");}
    static void no_links(const std::filesystem::path& path){std::filesystem::path current;for(auto& part:std::filesystem::absolute(path)){current/=part;auto attrs=GetFileAttributesW(current.c_str());if(attrs!=INVALID_FILE_ATTRIBUTES&&(attrs&FILE_ATTRIBUTE_REPARSE_POINT))throw std::runtime_error("更新目录包含链接，请检查安装路径");}}
    bool busy()const{return download_.valid()||helper_;}
    void start_helper(){
        wchar_t system[32768]{};if(!GetSystemDirectoryW(system,32768))throw std::runtime_error("无法定位更新助手");
        auto exe=std::filesystem::path(system)/L"WindowsPowerShell/v1.0/powershell.exe",script=job_/L"helper/update-and-restart.ps1",target=root_.parent_path().parent_path();
        auto command=L"\""+exe.wstring()+L"\" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \""+script.wstring()+L"\" -FoobarRoot \""+target.wstring()+L"\" -Job \""+job_.wstring()+L"\" -ParentPid "+std::to_wstring(GetCurrentProcessId());
        STARTUPINFOW startup{sizeof(startup)};startup.dwFlags=STARTF_USESHOWWINDOW;startup.wShowWindow=SW_HIDE;PROCESS_INFORMATION process{};
        if(!CreateProcessW(exe.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,script.parent_path().c_str(),&startup,&process))throw std::runtime_error("无法启动更新助手，请重试");
        CloseHandle(process.hThread);helper_=process.hProcess;state_["phase"]="installing";
    }
public:
    Updater(std::filesystem::path root,std::string version,std::string edition,std::filesystem::path fallback={}):settings_(root/L"updates.json"),root_(std::move(root)),fallback_(std::move(fallback)),current_(std::move(version)),edition_(std::move(edition)){
        try{std::ifstream in(settings_);json j;in>>j;automatic_=j.value("automatic",true);}catch(...){}
        state_={{"checking",false},{"available",false},{"automatic",automatic_},{"current",current_},{"edition",edition_},{"error",""},{"phase","idle"},{"in_app",true},{"last_result",read(root_/L"update-result.json")}};
        if(automatic_)check();
    }
    ~Updater(){if(progress_)progress_->cancel=true;if(download_.valid())download_.wait();if(helper_)CloseHandle(helper_);}
    json status()const{auto result=state_;if(progress_)result["downloaded"]=progress_->bytes.load();return result;}
    void automatic(bool enabled){automatic_=enabled;state_["automatic"]=enabled;auto temp=settings_;temp+=L".tmp";{std::ofstream out(temp);out<<json{{"automatic",enabled}}.dump();if(!out)throw std::runtime_error("无法保存更新设置");}if(!MoveFileExW(temp.c_str(),settings_.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法保存更新设置");}
    void check(){if(work_.valid()||busy())return;state_["checking"]=true;state_["error"]="";auto current=current_,edition=edition_;work_=std::async(std::launch::async,[current,edition]{
        try{return json{{"release",select_release(github_releases(),current,edition)},{"error",""}};}catch(const std::exception& e){return json{{"release",nullptr},{"error",e.what()}};}});}
    void begin_update(){
        if(busy())return;
        try{
            if(work_.valid()||!state_.value("available",false))throw std::runtime_error("请先完成更新检查");auto release=state_.at("release");validate_update_artifact(release,edition_);
            auto target=root_.parent_path().parent_path();no_links(root_);
            if(!std::filesystem::is_regular_file(target/L"portable_mode_enabled")||!std::filesystem::is_regular_file(target/L"foobar2000.exe"))throw std::runtime_error("软件内更新需要便携版播放器");
            auto helpers=root_/L"update-helper";if(!std::filesystem::is_regular_file(helpers/L"update_apply.py"))helpers=fallback_;
            if(helpers.empty())throw std::runtime_error("未安装内置更新助手，请先安装更新补丁");
            const wchar_t* files[]={L"update_apply.py",L"update-and-restart.ps1",L"install.py",L"switch_mode.py",L"profile_style.py"};
            for(auto file:files){no_links(helpers/file);if(!std::filesystem::is_regular_file(helpers/file))throw std::runtime_error("未安装内置更新助手，请先安装更新补丁");}
            auto updates=root_/L"updates";no_links(updates);std::filesystem::create_directories(updates);job_=updates/(std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));
            if(!std::filesystem::create_directory(job_))throw std::runtime_error("无法创建独立更新任务");std::filesystem::create_directory(job_/L"helper");
            for(auto file:files)std::filesystem::copy_file(helpers/file,job_/L"helper"/file);
            std::ofstream job(job_/L"job.json",std::ios::binary);job<<json{{"version",1},{"target",update_utf8(target)},{"pid",GetCurrentProcessId()},{"current",current_},{"edition",edition_},{"release",release}}.dump();job.close();if(!job)throw std::runtime_error("无法保存更新任务");
            state_["phase"]="downloading";state_["error"]="";state_["total"]=release.at("size");state_["last_result"]=json::object();progress_=std::make_shared<UpdateProgress>();reportedBytes_=0;
            auto folder=job_;auto edition=edition_;auto progress=progress_;
            download_=std::async(std::launch::async,[release,folder,edition,progress]{try{download_update_artifact(release,edition,folder,progress);return json{{"ok",true}};}catch(const std::exception& e){return json{{"ok",false},{"error",e.what()}};}});
        }catch(const std::exception& e){state_["phase"]="failed";state_["error"]=e.what();throw;}
    }
    bool poll(){
        bool changed=false;
        if(work_.valid()&&work_.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto result=work_.get();state_["checking"]=false;state_["error"]=result["error"];state_["release"]=result["release"];state_["available"]=!result["release"].is_null();state_["checked_at"]=std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());changed=true;}
        if(download_.valid()){
            auto bytes=progress_->bytes.load();if(bytes/1048576!=reportedBytes_/1048576){reportedBytes_=bytes;changed=true;}
            if(download_.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto result=download_.get();changed=true;
                if(result.value("ok",false)){try{start_helper();}catch(const std::exception& e){state_["phase"]="failed";state_["error"]=e.what();}}
                else{state_["phase"]="failed";state_["error"]=result.value("error",std::string("更新下载失败"));}
            }
        }
        if(helper_&&WaitForSingleObject(helper_,0)==WAIT_OBJECT_0){DWORD code=1;GetExitCodeProcess(helper_,&code);CloseHandle(helper_);helper_=nullptr;auto result=read(root_/L"update-result.json");state_["last_result"]=result;state_["phase"]="failed";state_["error"]=result_error(result);if(code==0&&result.value("ok",false)){state_["phase"]="complete";state_["error"]="";}changed=true;}
        return changed;
    }
};
}
