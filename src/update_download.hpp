#pragma once
#include "update_policy.hpp"
#include <windows.h>
#include <winhttp.h>
#include <bcrypt.h>
#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <memory>
#include <vector>
#include <array>
#include <condition_variable>
#include <mutex>
#pragma comment(lib,"winhttp.lib")
#pragma comment(lib,"bcrypt.lib")
namespace native_ss {
inline std::wstring update_wide(const std::string& s){int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),int(s.size()),nullptr,0);if(!n&&!s.empty())throw std::runtime_error("更新路径不是有效 UTF-8");std::wstring w(n,0);MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,s.data(),int(s.size()),w.data(),n);return w;}
inline std::string update_utf8(const std::filesystem::path& p){auto s=p.u8string();return {reinterpret_cast<const char*>(s.data()),s.size()};}
inline void validate_update_artifact(const nlohmann::json& release,const std::string& edition){
    auto version=release.at("version").get<std::string>(),hash=release.at("sha256").get<std::string>();
    auto asset="foobar-smartshuffle-"+edition+"-"+version+".zip";
    if((edition!="full"&&edition!="core")||!release_version(version)||release.at("tag")!="v"+version||release.at("asset")!=asset||release.at("url")!="https://github.com/CuteHeibai/foobar-smartshuffle/releases/download/v"+version+"/"+asset)
        throw std::runtime_error("更新包与当前版本类型不匹配");
    if(hash.size()!=64||hash.find_first_not_of("0123456789abcdef")!=std::string::npos)throw std::runtime_error("发布缺少有效的 SHA-256 校验值");
    auto size=release.at("size").get<int64_t>();if(size<=0||size>512LL*1024*1024)throw std::runtime_error("更新包大小无效");
}
class UpdateHash {
    BCRYPT_ALG_HANDLE algorithm_=nullptr;BCRYPT_HASH_HANDLE hash_=nullptr;
public:
    UpdateHash(){if(BCryptOpenAlgorithmProvider(&algorithm_,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)throw std::runtime_error("无法初始化更新校验");if(BCryptCreateHash(algorithm_,&hash_,nullptr,0,nullptr,0,0)<0){BCryptCloseAlgorithmProvider(algorithm_,0);throw std::runtime_error("无法创建更新校验");}}
    ~UpdateHash(){if(hash_)BCryptDestroyHash(hash_);if(algorithm_)BCryptCloseAlgorithmProvider(algorithm_,0);}
    void add(const char* data,size_t size){if(BCryptHashData(hash_,reinterpret_cast<PUCHAR>(const_cast<char*>(data)),ULONG(size),0)<0)throw std::runtime_error("更新校验失败");}
    std::string finish(){unsigned char value[32]{};if(BCryptFinishHash(hash_,value,32,0)<0)throw std::runtime_error("更新校验失败");std::string out;const char* hex="0123456789abcdef";for(auto byte:value){out+=hex[byte>>4];out+=hex[byte&15];}return out;}
};
inline std::string update_file_hash(const std::filesystem::path& path){std::ifstream file(path,std::ios::binary);if(!file)throw std::runtime_error("无法读取更新包");UpdateHash hash;char buffer[65536];while(file){file.read(buffer,sizeof(buffer));hash.add(buffer,size_t(file.gcount()));}if(!file.eof())throw std::runtime_error("更新包读取失败");return hash.finish();}
struct UpdateProgress {std::atomic<uint64_t> bytes{0};std::atomic<bool> cancel{false};};
class AsyncUpdateRequest {
    HINTERNET handle_=nullptr;std::mutex mutex_;std::condition_variable ready_;bool done_=false,closed_=false;DWORD error_=0,read_=0;
    static void CALLBACK callback(HINTERNET,DWORD_PTR context,DWORD status,LPVOID info,DWORD length){
        if(!context)return;auto& self=*reinterpret_cast<AsyncUpdateRequest*>(context);std::lock_guard lock(self.mutex_);
        if(status==WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING)self.closed_=true;
        else if(status==WINHTTP_CALLBACK_STATUS_REQUEST_ERROR){self.error_=static_cast<WINHTTP_ASYNC_RESULT*>(info)->dwError;self.done_=true;}
        else if(status==WINHTTP_CALLBACK_STATUS_READ_COMPLETE){self.read_=length;self.done_=true;}
        else if(status==WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE||status==WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE)self.done_=true;
        self.ready_.notify_all();
    }
    void arm(){std::lock_guard lock(mutex_);done_=false;error_=read_=0;}
    DWORD wait(const std::shared_ptr<UpdateProgress>& progress){
        std::unique_lock lock(mutex_);auto until=std::chrono::steady_clock::now()+std::chrono::seconds(35);
        while(!done_&&!progress->cancel){if(std::chrono::steady_clock::now()>until)throw std::runtime_error("更新下载响应超时");ready_.wait_for(lock,std::chrono::milliseconds(40));}
        if(progress->cancel)throw std::runtime_error("更新下载已取消");if(error_)throw std::runtime_error("更新下载连接中断，请重试");return read_;
    }
    static void started(BOOL ok){if(!ok&&GetLastError()!=ERROR_IO_PENDING)throw std::runtime_error("无法开始更新下载请求");}
public:
    std::array<char,65536> buffer{};
    explicit AsyncUpdateRequest(HINTERNET request):handle_(request){
        if(!handle_)throw std::runtime_error("无法创建更新下载请求");DWORD_PTR context=reinterpret_cast<DWORD_PTR>(this);
        if(!WinHttpSetOption(handle_,WINHTTP_OPTION_CONTEXT_VALUE,&context,sizeof(context))||WinHttpSetStatusCallback(handle_,callback,WINHTTP_CALLBACK_FLAG_SENDREQUEST_COMPLETE|WINHTTP_CALLBACK_FLAG_HEADERS_AVAILABLE|WINHTTP_CALLBACK_FLAG_READ_COMPLETE|WINHTTP_CALLBACK_FLAG_REQUEST_ERROR|WINHTTP_CALLBACK_FLAG_HANDLES,0)==WINHTTP_INVALID_STATUS_CALLBACK){WinHttpCloseHandle(handle_);throw std::runtime_error("无法初始化异步更新下载");}
    }
    ~AsyncUpdateRequest(){
        // Only the worker closes this asynchronous request, after every initiating
        // API call has returned. Keep callback context and read buffer alive until
        // HANDLE_CLOSING, the final callback for this handle.
        if(handle_&&WinHttpCloseHandle(handle_)){std::unique_lock lock(mutex_);ready_.wait(lock,[this]{return closed_;});}
    }
    HINTERNET get()const{return handle_;}
    void send(const std::shared_ptr<UpdateProgress>& progress){arm();started(WinHttpSendRequest(handle_,WINHTTP_NO_ADDITIONAL_HEADERS,0,nullptr,0,0,reinterpret_cast<DWORD_PTR>(this)));wait(progress);arm();started(WinHttpReceiveResponse(handle_,nullptr));wait(progress);}
    DWORD read(const std::shared_ptr<UpdateProgress>& progress){arm();started(WinHttpReadData(handle_,buffer.data(),DWORD(buffer.size()),nullptr));return wait(progress);}
};
inline void download_update_artifact(const nlohmann::json& release,const std::string& edition,const std::filesystem::path& job,const std::shared_ptr<UpdateProgress>& progress){
    validate_update_artifact(release,edition);
    struct Internet {HINTERNET h=nullptr;~Internet(){if(h)WinHttpCloseHandle(h);}operator HINTERNET()const{return h;}};
    auto url=update_wide(release.at("url").get<std::string>()),relative=url.substr(std::wstring(L"https://github.com").size());
    Internet session{WinHttpOpen(L"foo_smartshuffle-update/2",WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,nullptr,nullptr,WINHTTP_FLAG_ASYNC)};
    if(!session.h)throw std::runtime_error("无法初始化更新下载");WinHttpSetTimeouts(session,5000,5000,5000,5000);
    Internet connection{WinHttpConnect(session,L"github.com",INTERNET_DEFAULT_HTTPS_PORT,0)};if(!connection.h)throw std::runtime_error("无法连接更新下载服务");
    AsyncUpdateRequest transfer(WinHttpOpenRequest(connection,L"GET",relative.c_str(),nullptr,WINHTTP_NO_REFERER,WINHTTP_DEFAULT_ACCEPT_TYPES,WINHTTP_FLAG_SECURE));auto request=transfer.get();
    DWORD redirect=WINHTTP_OPTION_REDIRECT_POLICY_DISALLOW_HTTPS_TO_HTTP;WinHttpSetOption(request,WINHTTP_OPTION_REDIRECT_POLICY,&redirect,sizeof(redirect));
    transfer.send(progress);
    DWORD status=0,length=sizeof(status);if(!WinHttpQueryHeaders(request,WINHTTP_QUERY_STATUS_CODE|WINHTTP_QUERY_FLAG_NUMBER,nullptr,&status,&length,nullptr)||status!=200)throw std::runtime_error("更新服务器未返回完整安装包");
    DWORD chars=0;WinHttpQueryOption(request,WINHTTP_OPTION_URL,nullptr,&chars);std::vector<wchar_t> finalUrl(chars/sizeof(wchar_t)+1);
    if(!chars||!WinHttpQueryOption(request,WINHTTP_OPTION_URL,finalUrl.data(),&chars))throw std::runtime_error("无法验证更新下载地址");
    URL_COMPONENTS parts{sizeof(parts)};parts.dwHostNameLength=DWORD(-1);
    if(!WinHttpCrackUrl(finalUrl.data(),0,0,&parts)||parts.nScheme!=INTERNET_SCHEME_HTTPS)throw std::runtime_error("更新下载重定向不安全");
    std::wstring host(parts.lpszHostName,parts.dwHostNameLength);
    if(host!=L"github.com"&&host!=L"release-assets.githubusercontent.com"&&host!=L"objects.githubusercontent.com"&&host!=L"github-releases.githubusercontent.com")throw std::runtime_error("更新下载重定向不是 GitHub 资源");
    auto temporary=job/L"package.zip.part",archive=job/L"package.zip";std::ofstream file(temporary,std::ios::binary|std::ios::trunc);if(!file)throw std::runtime_error("无法保存更新包");
    try{
        UpdateHash hash;uint64_t total=0,expected=release.at("size").get<uint64_t>();auto started=std::chrono::steady_clock::now();
        for(;;){if(progress->cancel)throw std::runtime_error("更新下载已取消");DWORD read=transfer.read(progress);if(!read)break;
            total+=read;if(total>expected||std::chrono::steady_clock::now()-started>std::chrono::minutes(30))throw std::runtime_error("更新包大小异常或下载超时");file.write(transfer.buffer.data(),read);if(!file)throw std::runtime_error("更新包保存失败，请检查磁盘空间");hash.add(transfer.buffer.data(),read);progress->bytes=total;
        }
        file.close();if(!file||total!=expected)throw std::runtime_error("更新包下载不完整，请重试");if(hash.finish()!=release.at("sha256").get<std::string>())throw std::runtime_error("更新包 SHA-256 不匹配，已拒绝安装");
        std::filesystem::rename(temporary,archive);
    }catch(...){file.close();std::error_code error;std::filesystem::remove(temporary,error);throw;}
}
}
