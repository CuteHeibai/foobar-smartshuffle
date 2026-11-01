#pragma once
#include <filesystem>
#include <fstream>
#include "json.hpp"

namespace native_ss {
inline bool integration_switch_pending=false;
inline HANDLE integration_switch_process=nullptr;
inline UINT_PTR integration_switch_timer=0;
inline std::filesystem::path integration_root(){
    wchar_t exe[32768]{};
    if(!GetModuleFileNameW(nullptr,exe,32768))throw std::runtime_error("无法确定播放器目录");
    return std::filesystem::path(exe).parent_path();
}
inline nlohmann::json integration_json(const std::filesystem::path& path){
    std::ifstream file(path,std::ios::binary);if(!file)return nlohmann::json::object();
    try{return nlohmann::json::parse(file);}catch(...){return nlohmann::json::object();}
}
inline bool integration_full(){
    auto root=integration_root();auto marker=integration_json(root/L"profile/smartshuffle/installation.json");
    if(marker.contains("edition"))return marker.value("edition",std::string{})=="full";
    return std::filesystem::exists(root/L"profile/verdant/main.js");
}
inline bool integration_original(){
    return integration_full()&&integration_json(integration_root()/L"profile/smartshuffle/integration-mode.json").value("mode",std::string{})=="original";
}
inline bool integration_available(){
    return integration_full()&&std::filesystem::is_regular_file(integration_root()/L"profile/smartshuffle/control/switch-mode.ps1");
}
inline void CALLBACK integration_switch_poll(HWND,UINT,UINT_PTR,DWORD){
    if(!integration_switch_process||WaitForSingleObject(integration_switch_process,0)!=WAIT_OBJECT_0)return;
    DWORD code=1;GetExitCodeProcess(integration_switch_process,&code);CloseHandle(integration_switch_process);integration_switch_process=nullptr;
    KillTimer(nullptr,integration_switch_timer);integration_switch_timer=0;integration_switch_pending=false;
    auto result=integration_json(integration_root()/L"profile/smartshuffle/integration-switch-result.json");
    if(code||!result.value("ok",false)){
        auto error=result.value("error",nlohmann::json{});
        auto message=error.is_string()?error.get<std::string>():std::string("切换未完成，请重试或运行 control 中的切换脚本");
        popup_message::g_show(message.c_str(),"界面切换");
    }
}
inline void integration_switch(){
    if(integration_switch_pending)return;
    if(!integration_available())throw std::runtime_error("请先安装完整版的一键切换脚本");
    auto root=integration_root(),script=root/L"profile/smartshuffle/control/switch-mode.ps1";
    wchar_t system[32768]{};if(!GetSystemDirectoryW(system,32768))throw std::runtime_error("无法定位 PowerShell");
    auto exe=std::filesystem::path(system)/L"WindowsPowerShell/v1.0/powershell.exe";
    std::wstring command=L"\""+exe.wstring()+L"\" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \""+script.wstring()+L"\" -FoobarRoot \""+root.wstring()+L"\" -Mode toggle";
    STARTUPINFOW startup{sizeof(startup)};startup.dwFlags=STARTF_USESHOWWINDOW;startup.wShowWindow=SW_HIDE;PROCESS_INFORMATION process{};
    if(!CreateProcessW(exe.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,script.parent_path().c_str(),&startup,&process))throw std::runtime_error("无法启动界面切换，请运行 control 中的切换脚本");
    integration_switch_pending=true;integration_switch_process=process.hProcess;
    CloseHandle(process.hThread);
    integration_switch_timer=SetTimer(nullptr,0,500,integration_switch_poll);
    if(!integration_switch_timer){CloseHandle(integration_switch_process);integration_switch_process=nullptr;integration_switch_pending=false;}
}
}
