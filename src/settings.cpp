#include <foobar2000/SDK/foobar2000.h>
#include "settings.hpp"
#include "native_dialogs.hpp"
#include "integration_switch.hpp"

namespace native_ss {
namespace {
const GUID pageGuid={0x8f7347c1,0x4549,0x42d3,{0x95,0x8e,0x38,0xec,0xc8,0x82,0x13,0x91}};
std::function<void()> resetHandler;
class SettingsInstance:public preferences_page_instance {
public:
    SettingsInstance(HWND parent,preferences_page_callback::ptr callback):callback_(callback){
        HDC dc=GetDC(parent);dpi_=GetDeviceCaps(dc,LOGPIXELSY);ReleaseDC(parent,dc);
        font_=CreateFontW(-MulDiv(15,dpi_,96),0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Microsoft YaHei UI");
        brush_=CreateSolidBrush(RGB(18,18,18));
        static ATOM registered=[](){WNDCLASSEXW c{sizeof(c)};c.lpfnWndProc=proc;c.hInstance=core_api::get_my_instance();c.hCursor=LoadCursor(nullptr,IDC_ARROW);c.lpszClassName=L"SmartShuffleSettings";return RegisterClassExW(&c);}();
        if(!registered)throw std::runtime_error("无法注册智能随机设置页");
        window_=CreateWindowExW(WS_EX_CONTROLPARENT,L"SmartShuffleSettings",L"智能随机",WS_CHILD|WS_VISIBLE|WS_CLIPCHILDREN,0,0,520,300,parent,nullptr,core_api::get_my_instance(),this);
        if(!window_)throw std::runtime_error("无法创建智能随机设置页");
    }
    ~SettingsInstance(){if(IsWindow(window_))DestroyWindow(window_);if(font_)DeleteObject(font_);if(brush_)DeleteObject(brush_);}
    HWND get_wnd()override{return window_;}
    t_uint32 get_state()override{return preferences_state::dark_mode_supported|(pending_?preferences_state::changed:0)|(themed_installation()?preferences_state::resettable:0);}
    void apply()override{if(pending_){request_layout_reset();pending_=false;callback_->on_state_changed();}}
    void reset()override{if(themed_installation()){pending_=true;callback_->on_state_changed();}}
private:
    HWND window_=nullptr,description_=nullptr,button_=nullptr,status_=nullptr,update_=nullptr,integration_=nullptr;HFONT font_=nullptr;HBRUSH brush_=nullptr;
    int dpi_=96;bool pending_=false;preferences_page_callback::ptr callback_;
    int px(int n){return MulDiv(n,dpi_,96);}
    void create_controls(HWND w){
        description_=CreateWindowW(L"STATIC",L"拖动页面栏间的分隔线，可调整音乐库、主内容和歌词栏的宽度。调整后会自动保存。底部播放栏随窗口大小自动适配。",WS_CHILD|WS_VISIBLE,0,0,0,0,w,nullptr,core_api::get_my_instance(),nullptr);
        button_=CreateWindowW(L"BUTTON",L"一键恢复默认布局",WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_OWNERDRAW,0,0,0,0,w,reinterpret_cast<HMENU>(1001),core_api::get_my_instance(),nullptr);
        update_=CreateWindowW(L"BUTTON",L"检查更新…",WS_CHILD|WS_VISIBLE|WS_TABSTOP,0,0,0,0,w,reinterpret_cast<HMENU>(1002),core_api::get_my_instance(),nullptr);
        integration_=CreateWindowW(L"BUTTON",integration_original()?L"一键启用新版界面（重启）":L"一键停用改动，切换原版（重启）",WS_CHILD|WS_VISIBLE|WS_TABSTOP,0,0,0,0,w,reinterpret_cast<HMENU>(1003),core_api::get_my_instance(),nullptr);
        EnableWindow(integration_,integration_available());
        status_=CreateWindowW(L"STATIC",L"恢复默认栏宽；窗口约占当前屏幕可用面积的五分之二，纵横比自动适配。歌单、听歌记录、随机偏好和音频输出会保留。",WS_CHILD|WS_VISIBLE,0,0,0,0,w,nullptr,core_api::get_my_instance(),nullptr);
        for(auto child:{description_,button_,status_,update_,integration_})SendMessageW(child,WM_SETFONT,reinterpret_cast<WPARAM>(font_),TRUE);
        if(!themed_installation()){ShowWindow(button_,SW_HIDE);SetWindowTextW(description_,L"通过“播放 → 随机偏好 → 调整随机偏好”打开二维偏好窗口。独立插件版保留现有界面、字体及歌词设置。");SetWindowTextW(status_,L"更新窗口可检查新版本、下载独立插件包，并设置是否在启动时检查更新。");}
        if(integration_original()){ShowWindow(button_,SW_HIDE);ShowWindow(update_,SW_HIDE);SetWindowTextW(description_,L"当前为原版界面。智能调度、分析、资料查询及主题已停用；点击下方按钮正常退出并重新启用新版。歌单、听歌记录和音频输出共享保留。");SetWindowTextW(status_,L"原版与新版的界面设置分别保存。切换不会恢复旧歌单或旧收听记录。");}
        resize(w);
    }
    void resize(HWND w){RECT r{};GetClientRect(w,&r);int width=std::max(px(40),int(r.right)-px(40));
        MoveWindow(description_,px(20),px(16),width,px(82),TRUE);MoveWindow(button_,px(20),px(104),std::min(width,px(220)),px(38),TRUE);MoveWindow(update_,px(252),px(104),std::max(px(80),std::min(width-px(232),px(180))),px(38),TRUE);MoveWindow(integration_,px(20),px(152),std::min(width,px(410)),px(40),TRUE);MoveWindow(status_,px(20),px(206),width,px(86),TRUE);}
    static LRESULT CALLBACK proc(HWND w,UINT msg,WPARAM wp,LPARAM lp){
        auto self=reinterpret_cast<SettingsInstance*>(GetWindowLongPtrW(w,GWLP_USERDATA));
        if(msg==WM_NCCREATE){self=static_cast<SettingsInstance*>(reinterpret_cast<CREATESTRUCTW*>(lp)->lpCreateParams);SetWindowLongPtrW(w,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(self));}
        if(!self)return DefWindowProcW(w,msg,wp,lp);
        if(msg==WM_CREATE){self->create_controls(w);return 0;}
        if(msg==WM_SIZE){self->resize(w);return 0;}
        if(msg==WM_ERASEBKGND){RECT r;GetClientRect(w,&r);FillRect(reinterpret_cast<HDC>(wp),&r,self->brush_);return 1;}
        if(msg==WM_CTLCOLORSTATIC){SetTextColor(reinterpret_cast<HDC>(wp),RGB(225,225,225));SetBkColor(reinterpret_cast<HDC>(wp),RGB(18,18,18));return reinterpret_cast<LRESULT>(self->brush_);}
        if(msg==WM_DRAWITEM&&wp==1001){auto d=reinterpret_cast<DRAWITEMSTRUCT*>(lp);auto brush=CreateSolidBrush((d->itemState&ODS_SELECTED)?RGB(22,170,74):RGB(30,215,96));FillRect(d->hDC,&d->rcItem,brush);DeleteObject(brush);
            SetBkMode(d->hDC,TRANSPARENT);SetTextColor(d->hDC,RGB(0,0,0));auto old=SelectObject(d->hDC,self->font_);auto r=d->rcItem;DrawTextW(d->hDC,L"一键恢复默认布局",-1,&r,DT_CENTER|DT_VCENTER|DT_SINGLELINE);SelectObject(d->hDC,old);
            if(d->itemState&ODS_FOCUS){InflateRect(&r,-4,-4);DrawFocusRect(d->hDC,&r);}return TRUE;}
        if(msg==WM_COMMAND&&LOWORD(wp)==1001&&HIWORD(wp)==BN_CLICKED){
            preferences_page_instance::ptr alive=self;
            try{request_layout_reset();self->pending_=false;self->callback_->on_state_changed();SetWindowTextW(self->status_,L"已恢复默认布局和窗口大小。歌单、听歌记录及播放设置保持不变。");}
            catch(...){SetWindowTextW(self->status_,L"恢复未完成，请关闭设置页后重试。");}return 0;
        }
        if(msg==WM_COMMAND&&LOWORD(wp)==1002&&HIWORD(wp)==BN_CLICKED){open_updates(true);return 0;}
        if(msg==WM_COMMAND&&LOWORD(wp)==1003&&HIWORD(wp)==BN_CLICKED){try{integration_switch();SetWindowTextW(self->status_,L"正在正常退出并切换界面…");}catch(const std::exception& e){popup_message::g_show(e.what(),"界面切换");}return 0;}
        if(msg==WM_NCDESTROY){self->window_=nullptr;SetWindowLongPtrW(w,GWLP_USERDATA,0);}
        return DefWindowProcW(w,msg,wp,lp);
    }
};
class SettingsPage:public preferences_page_v3 {
    const char* get_name()override{return "智能随机";}
    GUID get_guid()override{return pageGuid;}
    GUID get_parent_guid()override{return preferences_page::guid_tools;}
    preferences_page_instance::ptr instantiate(HWND parent,preferences_page_callback::ptr callback)override{return new service_impl_t<SettingsInstance>(parent,callback);}
};
preferences_page_factory_t<SettingsPage> page;
}
void set_layout_reset_handler(std::function<void()> handler){resetHandler=std::move(handler);}
void request_layout_reset(){if(resetHandler)resetHandler();}
void open_settings(){ui_control::get()->show_preferences(pageGuid);}
}
