#pragma once
#include <commctrl.h>
// Display text only. Control IDs, edit contents, option values and command tokens
// stay owned by the original component. No third-party DLL is patched.
class LocalLabels {
    std::map<std::wstring,std::wstring> labels;
    HHOOK hook=nullptr;UINT_PTR timer=0;std::set<HWND> pending;size_t replacements=0;
    inline static LocalLabels* instance=nullptr;
    static std::wstring text(HWND w){int n=GetWindowTextLengthW(w);if(n<1||n>8192)return {};std::wstring s(n+1,0);GetWindowTextW(w,s.data(),n+1);s.resize(n);return s;}
    static std::wstring cls(HWND w){wchar_t name[128]{};GetClassNameW(w,name,128);return name;}
    static LRESULT CALLBACK observe(int code,WPARAM wp,LPARAM lp){
        if(code>=0&&instance){auto m=reinterpret_cast<CWPRETSTRUCT*>(lp);if(m->message==WM_INITDIALOG||m->message==WM_SHOWWINDOW||m->message==WM_SETTEXT){
            auto c=cls(m->hwnd);if(c==L"#32770"||c==L"Static"||c==L"Button"||c==L"SysTabControl32")instance->pending.insert(m->hwnd);
        }}return CallNextHookEx(nullptr,code,wp,lp);
    }
    void control(HWND w){
        auto c=cls(w);if(c==L"#32770"||c==L"Static"||c==L"Button"){
            auto old=text(w),next=translate(old);if(next!=old){SetWindowTextW(w,next.c_str());++replacements;}
        }else if(c==L"SysTabControl32"){
            for(int i=0,n=int(SendMessageW(w,TCM_GETITEMCOUNT,0,0));i<n;i++){
                wchar_t title[1024]{};TCITEMW item{};item.mask=TCIF_TEXT;item.pszText=title;item.cchTextMax=1024;
                if(SendMessageW(w,TCM_GETITEMW,i,reinterpret_cast<LPARAM>(&item))){auto next=translate(title);if(next!=title){item.pszText=next.data();SendMessageW(w,TCM_SETITEMW,i,reinterpret_cast<LPARAM>(&item));++replacements;}}
            }
        }
    }
public:
    explicit LocalLabels(const fs::path& file){
        try{auto j=readjson(file);for(auto it=j.begin();it!=j.end();++it)if(it.value().is_string())labels[wide(it.key())]=wide(it.value().get<std::string>());}catch(...){}
        instance=this;hook=SetWindowsHookExW(WH_CALLWNDPROCRET,observe,nullptr,GetCurrentThreadId());
        timer=SetTimer(nullptr,0,120,[](HWND,UINT,UINT_PTR,DWORD){if(instance)instance->flush();});
    }
    ~LocalLabels(){if(timer)KillTimer(nullptr,timer);if(hook)UnhookWindowsHookEx(hook);instance=nullptr;}
    std::wstring translate(std::wstring original)const{
        auto at=labels.find(original);if(at!=labels.end())return at->second;
        std::wstring plain;wchar_t accelerator=0;
        for(size_t i=0;i<original.size();++i){if(original[i]==L'&'&&i+1<original.size()){if(original[i+1]==L'&'){plain+=L'&';++i;}else accelerator=original[i+1];}else plain+=original[i];}
        at=labels.find(plain);if(at!=labels.end()){auto out=at->second;if(accelerator){out+=L" (&";out+=accelerator;out+=L")";}return out;}
        constexpr auto prefix=L"Preferences: ";if(original.rfind(prefix,0)==0)return L"参数选项："+translate(original.substr(wcslen(prefix)));
        return original;
    }
    void flush(){auto windows=std::move(pending);pending.clear();for(auto w:windows)if(IsWindow(w)){DWORD process=0;GetWindowThreadProcessId(w,&process);if(process!=GetCurrentProcessId())continue;control(w);if(cls(w)==L"#32770")EnumChildWindows(w,[](HWND child,LPARAM p){reinterpret_cast<LocalLabels*>(p)->control(child);return TRUE;},reinterpret_cast<LPARAM>(this));}}
    json status(){return {{"entries",labels.size()},{"replacements",replacements},{"hook",hook!=nullptr}};}
};
