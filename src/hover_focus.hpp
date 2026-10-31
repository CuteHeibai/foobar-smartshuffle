#pragma once
#include <windows.h>
#include <string>
#include <cstdint>
class HoverFocus {
    HHOOK hook_=nullptr;HWND surface_=nullptr;uint64_t focused_=0,routed_=0;
    inline static HoverFocus* instance_=nullptr;
    static LRESULT CALLBACK messages(int code,WPARAM removed,LPARAM value){
        if(code>=0&&removed==PM_REMOVE&&instance_){
            auto m=reinterpret_cast<MSG*>(value);auto self=instance_;
            if((m->message==WM_MOUSEWHEEL||(m->message==WM_MOUSEMOVE&&m->hwnd!=GetFocus()))&&IsWindowVisible(self->surface_)){
                HWND hit=m->hwnd;if(m->message==WM_MOUSEWHEEL){POINT point{short(LOWORD(m->lParam)),short(HIWORD(m->lParam))};hit=WindowFromPoint(point);}
                wchar_t name[128]{};GetClassNameW(GetFocus(),name,128);std::wstring cls=name;
                bool editing=cls.find(L"Edit")!=std::wstring::npos||cls.find(L"edit")!=std::wstring::npos||cls.find(L"ComboBox")!=std::wstring::npos;
                auto target=choose(self->surface_,hit,GetForegroundWindow(),GetCapture(),editing,(LOWORD(m->wParam)&(MK_LBUTTON|MK_RBUTTON|MK_MBUTTON))!=0);
                if(target){
                    if(GetFocus()!=target&&!IsChild(target,GetFocus())){SetFocus(target);if(GetFocus()==target)++self->focused_;}
                    if(m->message==WM_MOUSEWHEEL&&m->hwnd!=target){m->hwnd=target;++self->routed_;}
                }
            }
        }return CallNextHookEx(nullptr,code,removed,value);
    }
public:
    HoverFocus(){instance_=this;hook_=SetWindowsHookExW(WH_GETMESSAGE,messages,nullptr,GetCurrentThreadId());}
    ~HoverFocus(){if(hook_)UnhookWindowsHookEx(hook_);instance_=nullptr;}
    void set_surface(HWND surface){DWORD process=0;auto thread=GetWindowThreadProcessId(surface,&process);surface_=process==GetCurrentProcessId()&&thread==GetCurrentThreadId()?surface:nullptr;}
    bool installed()const{return hook_!=nullptr;}
    uint64_t surface()const{return reinterpret_cast<uintptr_t>(surface_);}
    uint64_t focused()const{return focused_;}
    uint64_t routed()const{return routed_;}
    static HWND choose(HWND surface,HWND hit,HWND foreground,HWND capture,bool editing,bool buttons){
        if(capture||editing||buttons||!IsWindow(surface)||!IsWindow(hit)||!IsWindowEnabled(hit))return nullptr;
        if(GetAncestor(foreground,GA_ROOT)!=GetAncestor(surface,GA_ROOT))return nullptr;
        DWORD process=0;if(GetWindowThreadProcessId(hit,&process)!=GetCurrentThreadId()||process!=GetCurrentProcessId())return nullptr;
        if(hit!=surface&&!IsChild(surface,hit))return nullptr;
        auto target=hit;while(target!=surface&&GetParent(target)!=surface)target=GetParent(target);return target;
    }
};
