#include <foobar2000/SDK/foobar2000.h>
#include <shobjidl.h>
#include <shellapi.h>
#include <wrl/client.h>
#include "recycle.hpp"
#include <stdexcept>

namespace native_ss {
namespace {
using Microsoft::WRL::ComPtr;
using Stamp=std::array<uint64_t,5>;
std::string utf8(const std::filesystem::path& path){auto s=path.u8string();return {s.begin(),s.end()};}
Stamp stamp(const std::filesystem::path& path){
    DWORD attributes=GetFileAttributesW(path.c_str());
    if(attributes==INVALID_FILE_ATTRIBUTES||(attributes&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT)))throw std::runtime_error("请选择存在的本地音乐文件，文件夹和链接不能使用此操作");
    wchar_t volume[32768]{};
    if(!GetVolumePathNameW(path.c_str(),volume,32768)||GetDriveTypeW(volume)!=DRIVE_FIXED)throw std::runtime_error("此位置不支持可靠的本地回收站操作，请通过文件管理器处理");
    HANDLE file=CreateFileW(path.c_str(),FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr);
    if(file==INVALID_HANDLE_VALUE)throw std::runtime_error("无法读取歌曲文件，请检查权限或文件占用");
    BY_HANDLE_FILE_INFORMATION info{};BOOL ok=GetFileInformationByHandle(file,&info);CloseHandle(file);
    if(!ok)throw std::runtime_error("无法确认歌曲文件的标识");
    auto pair=[](DWORD a,DWORD b){return (uint64_t(a)<<32)|b;};
    return {info.dwVolumeSerialNumber,pair(info.nFileIndexHigh,info.nFileIndexLow),pair(info.nFileSizeHigh,info.nFileSizeLow),pair(info.ftLastWriteTime.dwHighDateTime,info.ftLastWriteTime.dwLowDateTime),pair(info.ftCreationTime.dwHighDateTime,info.ftCreationTime.dwLowDateTime)};
}
class RecycleSink:public IFileOperationProgressSink {
    LONG references_=1;
public:
    bool recycled=false;HRESULT result=E_ABORT;
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id,void** out)override{if(!out)return E_POINTER;*out=nullptr;if(id==IID_IUnknown||id==__uuidof(IFileOperationProgressSink)){*out=static_cast<IFileOperationProgressSink*>(this);AddRef();return S_OK;}return E_NOINTERFACE;}
    ULONG STDMETHODCALLTYPE AddRef()override{return InterlockedIncrement(&references_);}
    ULONG STDMETHODCALLTYPE Release()override{auto n=InterlockedDecrement(&references_);if(!n)delete this;return n;}
    HRESULT STDMETHODCALLTYPE StartOperations()override{return S_OK;}
    HRESULT STDMETHODCALLTYPE FinishOperations(HRESULT)override{return S_OK;}
    HRESULT STDMETHODCALLTYPE PreRenameItem(DWORD,IShellItem*,LPCWSTR)override{return E_ABORT;}
    HRESULT STDMETHODCALLTYPE PostRenameItem(DWORD,IShellItem*,LPCWSTR,HRESULT,IShellItem*)override{return S_OK;}
    HRESULT STDMETHODCALLTYPE PreMoveItem(DWORD,IShellItem*,IShellItem*,LPCWSTR)override{return E_ABORT;}
    HRESULT STDMETHODCALLTYPE PostMoveItem(DWORD,IShellItem*,IShellItem*,LPCWSTR,HRESULT,IShellItem*)override{return S_OK;}
    HRESULT STDMETHODCALLTYPE PreCopyItem(DWORD,IShellItem*,IShellItem*,LPCWSTR)override{return E_ABORT;}
    HRESULT STDMETHODCALLTYPE PostCopyItem(DWORD,IShellItem*,IShellItem*,LPCWSTR,HRESULT,IShellItem*)override{return S_OK;}
    HRESULT STDMETHODCALLTYPE PreDeleteItem(DWORD flags,IShellItem*)override{return (flags&TSF_DELETE_RECYCLE_IF_POSSIBLE)?S_OK:E_ABORT;}
    HRESULT STDMETHODCALLTYPE PostDeleteItem(DWORD,IShellItem*,HRESULT status,IShellItem* binItem)override{result=status;recycled=SUCCEEDED(status)&&binItem!=nullptr;return S_OK;}
    HRESULT STDMETHODCALLTYPE PreNewItem(DWORD,IShellItem*,LPCWSTR)override{return E_ABORT;}
    HRESULT STDMETHODCALLTYPE PostNewItem(DWORD,IShellItem*,LPCWSTR,LPCWSTR,DWORD,HRESULT,IShellItem*)override{return S_OK;}
    HRESULT STDMETHODCALLTYPE UpdateProgress(UINT,UINT)override{return S_OK;}
    HRESULT STDMETHODCALLTYPE ResetTimer()override{return S_OK;}
    HRESULT STDMETHODCALLTYPE PauseTimer()override{return S_OK;}
    HRESULT STDMETHODCALLTYPE ResumeTimer()override{return S_OK;}
};
void check(HRESULT hr){if(FAILED(hr))throw std::runtime_error("Windows 未完成回收站操作，文件可能被占用或没有权限");}
}
nlohmann::json RecycleManager::prepare(const std::string& uri,const std::filesystem::path& path,bool shared){
    pending_.reset();auto extension=path.extension().wstring();for(auto& c:extension)c=towlower(c);
    if(extension==L".cue")throw std::runtime_error("外部 CUE 引用了其他音频文件，不能从单首歌曲安全确定删除范围，请在文件管理器中处理");
    auto identity=stamp(path);GUID guid{};check(CoCreateGuid(&guid));wchar_t token[40]{};StringFromGUID2(guid,token,40);
    std::string id;for(auto c:std::wstring(token))id+=char(c);
    pending_=Pending{id,uri,path,identity,std::chrono::steady_clock::now()};
    return {{"token",id},{"path",utf8(path)},{"bytes",identity[2]},{"shared_file",shared}};
}
std::string RecycleManager::validate(const std::string& token){
    if(!pending_||pending_->token!=token||std::chrono::steady_clock::now()-pending_->created>std::chrono::minutes(2))throw std::runtime_error("删除确认已失效，请重新右键选择歌曲");
    if(stamp(pending_->path)!=pending_->stamp){pending_.reset();throw std::runtime_error("歌曲文件在确认期间发生变化，请重新核对");}
    return pending_->uri;
}
std::string RecycleManager::apply(const std::string& token){
    validate(token);const auto pending=*pending_;
    ComPtr<IFileOperation> operation;check(CoCreateInstance(CLSID_FileOperation,nullptr,CLSCTX_INPROC_SERVER,IID_PPV_ARGS(&operation)));
    check(operation->SetOwnerWindow(core_api::get_main_window()));
    check(operation->SetOperationFlags(FOFX_RECYCLEONDELETE|FOFX_ADDUNDORECORD|FOF_NO_CONNECTED_ELEMENTS|FOF_NOCONFIRMATION|FOF_SILENT|FOF_NOERRORUI|FOFX_EARLYFAILURE));
    ComPtr<IShellItem> item;check(SHCreateItemFromParsingName(pending.path.c_str(),nullptr,IID_PPV_ARGS(&item)));
    ComPtr<RecycleSink> sink;sink.Attach(new RecycleSink());check(operation->DeleteItem(item.Get(),sink.Get()));
    check(operation->PerformOperations());BOOL aborted=TRUE;check(operation->GetAnyOperationsAborted(&aborted));
    if(aborted||FAILED(sink->result)||!sink->recycled)throw std::runtime_error("Windows 未确认文件进入回收站，操作未完成");
    pending_.reset();return pending.uri;
}
}
