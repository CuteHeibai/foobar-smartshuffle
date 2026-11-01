#pragma once
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winhttp.h>
#include "update_policy.hpp"
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
    std::filesystem::path settings_;std::string current_,edition_;std::future<json> work_;bool automatic_=true;
    json state_;
public:
    Updater(std::filesystem::path root,std::string version,std::string edition):settings_(root/L"updates.json"),current_(std::move(version)),edition_(std::move(edition)){
        try{std::ifstream in(settings_);json j;in>>j;automatic_=j.value("automatic",true);}catch(...){}
        state_={{"checking",false},{"available",false},{"automatic",automatic_},{"current",current_},{"edition",edition_},{"error",""}};
        if(automatic_)check();
    }
    json status()const{return state_;}
    void automatic(bool enabled){automatic_=enabled;state_["automatic"]=enabled;auto temp=settings_;temp+=L".tmp";{std::ofstream out(temp);out<<json{{"automatic",enabled}}.dump();if(!out)throw std::runtime_error("无法保存更新设置");}if(!MoveFileExW(temp.c_str(),settings_.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法保存更新设置");}
    void check(){if(work_.valid())return;state_["checking"]=true;state_["error"]="";auto current=current_,edition=edition_;work_=std::async(std::launch::async,[current,edition]{
        try{return json{{"release",select_release(github_releases(),current,edition)},{"error",""}};}catch(const std::exception& e){return json{{"release",nullptr},{"error",e.what()}};}});}
    bool poll(){if(!work_.valid()||work_.wait_for(std::chrono::seconds(0))!=std::future_status::ready)return false;auto result=work_.get();state_["checking"]=false;state_["error"]=result["error"];state_["release"]=result["release"];state_["available"]=!result["release"].is_null();state_["checked_at"]=std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());return true;}
};
}
