#include <foobar2000/SDK/foobar2000.h>
#include <foobar2000/SDK/coreDarkMode.h>
#include <optional>
#include <set>
#include "settings.hpp"
#include "native_dialogs.hpp"
#include "integration_switch.hpp"

namespace native_ss {
namespace {
const GUID pageGuid={0x8f7347c1,0x4549,0x42d3,{0x95,0x8e,0x38,0xec,0xc8,0x82,0x13,0x91}};
std::function<void()> resetHandler;
const GUID personalGuid={0xf097ed3a,0x8de4,0x494e,{0x93,0x4c,0x6a,0x51,0x7b,0x10,0xe5,0x26}};
cfg_bool personalEnabled(personalGuid,false);
std::function<void(bool)> personalHandler,statsHandler;
const GUID statsGuid={0xcbbaa93f,0x0cb1,0x4a57,{0x8a,0x09,0x88,0x9c,0xa2,0x11,0xbb,0x49}};
cfg_bool statsEnabled(statsGuid,true);
std::optional<bool> settingsDarkMode;
class SettingsInstance;
std::set<SettingsInstance*> settingsInstances;
bool settings_dark_mode(){return settingsDarkMode.value_or(ui_config_manager::g_is_dark_mode());}

class SettingsInstance:public preferences_page_instance,private ui_config_callback_impl {
public:
    SettingsInstance(HWND parent,preferences_page_callback::ptr callback):dark_(settings_dark_mode()),darkHooks_(dark_),callback_(callback){
        HDC dc=GetDC(parent);dpi_=GetDeviceCaps(dc,LOGPIXELSY);ReleaseDC(parent,dc);
        font_=CreateFontW(-MulDiv(15,dpi_,96),0,0,0,FW_NORMAL,FALSE,FALSE,FALSE,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Microsoft YaHei UI");
        brush_=CreateSolidBrush(background());
        static ATOM registered=[](){WNDCLASSEXW c{sizeof(c)};c.lpfnWndProc=proc;c.hInstance=core_api::get_my_instance();c.hCursor=LoadCursor(nullptr,IDC_ARROW);c.lpszClassName=L"SmartShuffleSettings";return RegisterClassExW(&c);}();
        if(!registered)throw std::runtime_error("无法注册智能随机设置页");
        window_=CreateWindowExW(WS_EX_CONTROLPARENT,L"SmartShuffleSettings",L"智能随机",WS_CHILD|WS_VISIBLE|WS_CLIPCHILDREN,0,0,520,300,parent,nullptr,core_api::get_my_instance(),this);
        if(!window_)throw std::runtime_error("无法创建智能随机设置页");
        settingsInstances.insert(this);
    }
    ~SettingsInstance(){settingsInstances.erase(this);if(IsWindow(window_))DestroyWindow(window_);if(font_)DeleteObject(font_);if(brush_)DeleteObject(brush_);}
    void refresh_appearance(){
        const bool dark=settings_dark_mode();
        if(dark_==dark)return;
        dark_=dark;
        if(auto next=CreateSolidBrush(background())){if(brush_)DeleteObject(brush_);brush_=next;}
        darkHooks_.SetDark(dark_);
        if(window_)RedrawWindow(window_,nullptr,nullptr,RDW_INVALIDATE|RDW_ERASE|RDW_ALLCHILDREN);
    }
    HWND get_wnd()override{return window_;}
    t_uint32 get_state()override{return preferences_state::dark_mode_supported|((pending_||personal_changed()||stats_changed())?preferences_state::changed:0)|(themed_installation()?preferences_state::resettable:0);}
    void apply()override{if(stats_changed())set_listening_stats_enabled(SendMessageW(stats_,BM_GETCHECK,0,0)==BST_CHECKED);if(personal_changed())set_personal_library_enabled(SendMessageW(personal_,BM_GETCHECK,0,0)==BST_CHECKED);if(pending_){request_layout_reset();pending_=false;}callback_->on_state_changed();}
    void reset()override{if(themed_installation()){pending_=true;SendMessageW(personal_,BM_SETCHECK,BST_UNCHECKED,0);SendMessageW(stats_,BM_SETCHECK,BST_CHECKED,0);callback_->on_state_changed();}}
private:
    HWND window_=nullptr,description_=nullptr,button_=nullptr,status_=nullptr,update_=nullptr,integration_=nullptr,personal_=nullptr,stats_=nullptr;HFONT font_=nullptr;HBRUSH brush_=nullptr;
    int dpi_=96;bool pending_=false,dark_;
    fb2k::CCoreDarkModeHooks darkHooks_;
    preferences_page_callback::ptr callback_;
    COLORREF background()const{return dark_?RGB(18,18,18):RGB(250,250,250);}
    COLORREF foreground()const{return dark_?RGB(225,225,225):RGB(18,18,18);}
    void ui_colors_changed()override{refresh_appearance();}
    int px(int n){return MulDiv(n,dpi_,96);}
    bool personal_available(){return themed_installation()&&!integration_original();}
    bool personal_changed(){return personal_&&personal_available()&&((SendMessageW(personal_,BM_GETCHECK,0,0)==BST_CHECKED)!=personal_library_enabled());}
    bool stats_changed(){return stats_&&personal_available()&&((SendMessageW(stats_,BM_GETCHECK,0,0)==BST_CHECKED)!=listening_stats_enabled());}
    void create_controls(HWND w){
        description_=CreateWindowW(L"STATIC",L"拖动页面栏间的分隔线，可调整音乐库、主内容和歌词栏的宽度。调整后会自动保存。底部播放栏随窗口大小自动适配。",WS_CHILD|WS_VISIBLE,0,0,0,0,w,nullptr,core_api::get_my_instance(),nullptr);
        personal_=CreateWindowW(L"BUTTON",L"启用播放历史、收藏和稍后听",WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_AUTOCHECKBOX,0,0,0,0,w,reinterpret_cast<HMENU>(1004),core_api::get_my_instance(),nullptr);
        SendMessageW(personal_,BM_SETCHECK,personal_library_enabled()?BST_CHECKED:BST_UNCHECKED,0);
        stats_=CreateWindowW(L"BUTTON",L"记录听歌统计",WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_AUTOCHECKBOX,0,0,0,0,w,reinterpret_cast<HMENU>(1005),core_api::get_my_instance(),nullptr);
        SendMessageW(stats_,BM_SETCHECK,listening_stats_enabled()?BST_CHECKED:BST_UNCHECKED,0);
        if(!personal_available()){ShowWindow(personal_,SW_HIDE);ShowWindow(stats_,SW_HIDE);}
        button_=CreateWindowW(L"BUTTON",L"一键恢复默认布局",WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_OWNERDRAW,0,0,0,0,w,reinterpret_cast<HMENU>(1001),core_api::get_my_instance(),nullptr);
        update_=CreateWindowW(L"BUTTON",L"检查更新…",WS_CHILD|WS_VISIBLE|WS_TABSTOP,0,0,0,0,w,reinterpret_cast<HMENU>(1002),core_api::get_my_instance(),nullptr);
        integration_=CreateWindowW(L"BUTTON",integration_original()?L"一键启用新版界面（重启）":L"一键停用改动，切换原版（重启）",WS_CHILD|WS_VISIBLE|WS_TABSTOP,0,0,0,0,w,reinterpret_cast<HMENU>(1003),core_api::get_my_instance(),nullptr);
        EnableWindow(integration_,integration_available());
        status_=CreateWindowW(L"STATIC",L"恢复默认栏宽和窗口大小，窗口约占当前屏幕可用面积的五分之二。关闭听歌统计保留已有记录。历史、收藏和稍后听的入口默认隐藏。",WS_CHILD|WS_VISIBLE,0,0,0,0,w,nullptr,core_api::get_my_instance(),nullptr);
        for(auto child:{description_,personal_,stats_,button_,status_,update_,integration_})SendMessageW(child,WM_SETFONT,reinterpret_cast<WPARAM>(font_),TRUE);
        if(!themed_installation()){ShowWindow(button_,SW_HIDE);SetWindowTextW(description_,L"通过“播放 → 随机偏好 → 调整随机偏好”打开二维偏好窗口。独立插件版保留现有界面、字体及歌词设置。");SetWindowTextW(status_,L"更新窗口可检查新版本、下载独立插件包，并设置是否在启动时检查更新。");}
        if(integration_original()){ShowWindow(button_,SW_HIDE);ShowWindow(update_,SW_HIDE);SetWindowTextW(description_,L"当前为原版界面。智能调度、分析、资料查询及主题已停用；点击下方按钮正常退出并重新启用新版。歌单、听歌记录和音频输出共享保留。");SetWindowTextW(status_,L"原版与新版的界面设置分别保存。切换不会恢复旧歌单或旧收听记录。");}
        darkHooks_.AddControls(w);
        resize(w);
    }
    void resize(HWND w){RECT r{};GetClientRect(w,&r);int width=std::max(px(40),int(r.right)-px(40));
        MoveWindow(description_,px(20),px(16),width,px(personal_available()?50:82),TRUE);MoveWindow(personal_,px(20),px(72),width,px(28),TRUE);MoveWindow(stats_,px(20),px(100),width,px(26),TRUE);int actionsY=personal_available()?132:104;MoveWindow(button_,px(20),px(actionsY),std::min(width,px(220)),px(38),TRUE);MoveWindow(update_,px(252),px(actionsY),std::max(px(80),std::min(width-px(232),px(180))),px(38),TRUE);MoveWindow(integration_,px(20),px(actionsY+46),std::min(width,px(410)),px(40),TRUE);MoveWindow(status_,px(20),px(actionsY+94),width,px(72),TRUE);}
    static LRESULT CALLBACK proc(HWND w,UINT msg,WPARAM wp,LPARAM lp){
        auto self=reinterpret_cast<SettingsInstance*>(GetWindowLongPtrW(w,GWLP_USERDATA));
        if(msg==WM_NCCREATE){self=static_cast<SettingsInstance*>(reinterpret_cast<CREATESTRUCTW*>(lp)->lpCreateParams);SetWindowLongPtrW(w,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(self));}
        if(!self)return DefWindowProcW(w,msg,wp,lp);
        if(msg==WM_CREATE){self->create_controls(w);return 0;}
        if(msg==WM_SIZE){self->resize(w);return 0;}
        if(msg==WM_ERASEBKGND){RECT r;GetClientRect(w,&r);FillRect(reinterpret_cast<HDC>(wp),&r,self->brush_);return 1;}
        if(msg==WM_CTLCOLORSTATIC){SetTextColor(reinterpret_cast<HDC>(wp),self->foreground());SetBkColor(reinterpret_cast<HDC>(wp),self->background());return reinterpret_cast<LRESULT>(self->brush_);}
        if(msg==WM_DRAWITEM&&wp==1001){auto d=reinterpret_cast<DRAWITEMSTRUCT*>(lp);const bool pressed=(d->itemState&ODS_SELECTED)!=0;
            auto brush=CreateSolidBrush(self->dark_?(pressed?RGB(22,170,74):RGB(30,215,96)):(pressed?RGB(0,92,214):RGB(10,110,240)));FillRect(d->hDC,&d->rcItem,brush);DeleteObject(brush);
            SetBkMode(d->hDC,TRANSPARENT);SetTextColor(d->hDC,self->dark_?RGB(0,0,0):RGB(255,255,255));auto old=SelectObject(d->hDC,self->font_);auto r=d->rcItem;DrawTextW(d->hDC,L"一键恢复默认布局",-1,&r,DT_CENTER|DT_VCENTER|DT_SINGLELINE);SelectObject(d->hDC,old);
            if(d->itemState&ODS_FOCUS){InflateRect(&r,-4,-4);DrawFocusRect(d->hDC,&r);}return TRUE;}
        if(msg==WM_COMMAND&&LOWORD(wp)==1001&&HIWORD(wp)==BN_CLICKED){
            preferences_page_instance::ptr alive=self;
            try{request_layout_reset();self->pending_=false;self->callback_->on_state_changed();SetWindowTextW(self->status_,L"已恢复默认布局和窗口大小。歌单、听歌记录及播放设置保持不变。");}
            catch(...){SetWindowTextW(self->status_,L"恢复未完成，请关闭设置页后重试。");}return 0;
        }
        if(msg==WM_COMMAND&&LOWORD(wp)==1002&&HIWORD(wp)==BN_CLICKED){open_updates(true);return 0;}
        if(msg==WM_COMMAND&&(LOWORD(wp)==1004||LOWORD(wp)==1005)&&HIWORD(wp)==BN_CLICKED){self->callback_->on_state_changed();return 0;}
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
bool personal_library_enabled(){return personalEnabled;}
void set_personal_library_enabled(bool enabled){if(bool(personalEnabled)==enabled)return;personalEnabled=enabled;if(personalHandler)personalHandler(enabled);}
void set_personal_library_handler(std::function<void(bool)> handler){personalHandler=std::move(handler);}
bool listening_stats_enabled(){return statsEnabled;}
void set_listening_stats_enabled(bool enabled){if(bool(statsEnabled)==enabled)return;statsEnabled=enabled;if(statsHandler)statsHandler(enabled);}
void set_listening_stats_handler(std::function<void(bool)> handler){statsHandler=std::move(handler);}
void set_settings_dark_mode(bool dark){
    settingsDarkMode=dark;
    for(auto instance:settingsInstances)instance->refresh_appearance();
}
void open_settings(){ui_control::get()->show_preferences(pageGuid);}
}
