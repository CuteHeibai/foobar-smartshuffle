#include <foobar2000/SDK/foobar2000.h>
#include <foobar2000/SDK/ui_element.h>
#include <foobar2000/SDK/configStore.h>
#include "lyrics_host.hpp"
#include <algorithm>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>

namespace native_ss {
namespace {
bool in_this_process(HWND window) {
    DWORD process = 0;
    return window && IsWindow(window) && GetWindowThreadProcessId(window, &process)
        && process == GetCurrentProcessId();
}
HWND parent_from_json(const nlohmann::json& request) {
    const auto& value = request.at("parent");
    if (!value.is_number_integer() || (value.is_number_integer() && !value.is_number_unsigned() && value.get<int64_t>() < 0))
        throw std::runtime_error("歌词面板父窗口句柄无效");
    const auto raw = value.get<uint64_t>();
    if (raw == 0 || raw > std::numeric_limits<uintptr_t>::max())
        throw std::runtime_error("歌词面板父窗口句柄无效");
    const auto parent = reinterpret_cast<HWND>(static_cast<uintptr_t>(raw));
    if (!in_this_process(parent)) throw std::runtime_error("歌词面板必须属于当前 foobar2000 进程");
    return parent;
}
int dimension(const nlohmann::json& request, const char* key, bool nonnegative) {
    const auto& value = request.at(key);
    if (!value.is_number_integer()) throw std::runtime_error("歌词面板位置与尺寸必须为整数");
    if (value.is_number_unsigned() && value.get<uint64_t>() > static_cast<uint64_t>(std::numeric_limits<int>::max()))
        throw std::runtime_error("歌词面板位置或尺寸超出范围");
    const auto raw = value.get<int64_t>();
    if (raw < (nonnegative ? 0 : std::numeric_limits<int>::min()) || raw > std::numeric_limits<int>::max())
        throw std::runtime_error("歌词面板位置或尺寸超出范围");
    return static_cast<int>(raw);
}
bool eslyric_name(const char* name) {
    std::string normalized = name;
    for (char& c : normalized) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    return normalized == "eslyric";
}
UINT window_dpi(HWND window) {
    // The shipped SDK targets an older _WIN32_WINNT. Resolve the modern API
    // without changing its compatibility macros for the entire component.
    using get_dpi = UINT (WINAPI*)(HWND);
    const auto user32 = GetModuleHandleW(L"user32.dll");
    const auto query = user32 ? reinterpret_cast<get_dpi>(GetProcAddress(user32, "GetDpiForWindow")) : nullptr;
    if (query) { const UINT dpi = query(window); if (dpi) return dpi; }
    const auto dc = GetDC(window);
    if (!dc) return 96;
    const int dpi = GetDeviceCaps(dc, LOGPIXELSY);
    ReleaseDC(window, dc);
    return dpi > 0 ? static_cast<UINT>(dpi) : 96;
}
}

class LyricsHost::Impl : public ui_element_instance_callback_receiver {
public:
    ~Impl() { release(); }

    nlohmann::json update(const nlohmann::json& request) {
        if (!core_api::is_main_thread())
            return {{"ready", false}, {"visible", false}, {"error", "歌词面板更新必须在 foobar2000 主线程执行"}};
        try {
            if (!healthy() && instance_.is_valid()) release();
            if (!request.is_object()) throw std::runtime_error("歌词面板请求必须为对象");
            const bool show = request.at("visible").get<bool>();
            // Cleanup/hide can be sent during panel unload without a parent handle.
            if (!show && !request.contains("parent")) {
                set_visible(false);
                error_.clear();
                return status();
            }
            const auto parent = parent_from_json(request);
            if (!show) {
                if (parent_ && parent_ != parent) release();
                set_visible(false);
                error_.clear();
                return status();
            }
            const int x = dimension(request, "x", false), y = dimension(request, "y", false);
            const int width = dimension(request, "w", true), height = dimension(request, "h", true);
            if (parent_ && parent_ != parent) release();
            if (width == 0 || height == 0) {
                set_visible(false);
                error_.clear();
                return status();
            }
            parent_ = parent;
            ensure_font();
            if (instance_.is_empty()) create();
            if (!healthy()) throw std::runtime_error("ESLyric 未创建有效的歌词子窗口");
            if (!SetWindowPos(window_, nullptr, x, y, width, height, SWP_NOACTIVATE | SWP_NOZORDER))
                throw std::runtime_error("无法调整歌词面板大小");
            set_visible(true);
            error_.clear();
        } catch (const std::exception& e) {
            error_ = e.what();
            if (!healthy()) release();
        } catch (...) {
            error_ = "ESLyric 面板初始化失败";
            if (!healthy()) release();
        }
        return status();
    }

    nlohmann::json status() {
        // Window destruction also destroys its child HWND. Release the remaining
        // service resources on the next main-thread status/update poll.
        if (core_api::is_main_thread() && instance_.is_valid() && !healthy()) {
            release();
            error_ = "歌词面板父窗口或子窗口已销毁";
        }
        const bool ready = healthy();
        bool segoe=false,simsun=false;
        if(ready)try{auto cfg=instance_->get_configuration();std::string data(static_cast<const char*>(cfg->get_data()),cfg->get_data_size());segoe=data.find("Segoe UI")!=std::string::npos;simsun=data.find("SimSun")!=std::string::npos;}catch(...){}
        return {{"ready", ready}, {"visible", ready && visible_ && IsWindowVisible(window_) != FALSE}, {"error", error_},{"configuration_segoe_ui",segoe},{"configuration_simsun",simsun}};
    }

    bool query_color(const GUID& which, t_ui_color& result) override {
        if (which == ui_color_background) result = RGB(18, 18, 18);
        else if (which == ui_color_text) result = RGB(225, 225, 225);
        else if (which == ui_color_highlight) result = RGB(30, 215, 96);
        else if (which == ui_color_selection) result = RGB(60, 60, 60);
        else if (which == ui_color_darkmode) result = 0;
        else return false;
        return true;
    }
    t_ui_font query_font_ex(const GUID&) override { return font_; }
    bool is_elem_visible(ui_element_instance::ptr item) override {
        if (instance_.is_valid() && item.get_ptr() != instance_.get_ptr()) return false;
        return visible_ && in_this_process(parent_) && IsWindowVisible(parent_) != FALSE;
    }
    bool request_activation(ui_element_instance::ptr item) override {
        // Do not expose a different page, move focus, or show any unrelated window.
        return item.get_ptr() == instance_.get_ptr() && healthy() && visible_
            && IsWindowVisible(window_) != FALSE;
    }

private:
    HWND parent_ = nullptr, window_ = nullptr;
    HFONT font_ = nullptr;
    UINT dpi_ = 0;
    bool visible_ = false;
    std::string error_;
    std::string lastConfiguration_;
    ui_element::ptr element_;
    ui_element_instance::ptr instance_;

    bool healthy() const {
        return instance_.is_valid() && in_this_process(parent_) && in_this_process(window_)
            && GetParent(window_) == parent_ && (GetWindowLongPtrW(window_, GWL_STYLE) & WS_CHILD) != 0;
    }
    void ensure_font() {
        const UINT effective = window_dpi(parent_);
        if (font_ && dpi_ == effective) return;
        const auto replacement = CreateFontW(-MulDiv(15, static_cast<int>(effective), 96), 0, 0, 0,
            FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
        if (!replacement) throw std::runtime_error("无法创建歌词面板字体");
        const auto old = font_;
        font_ = replacement;
        dpi_ = effective;
        // Both old and new font handles remain valid throughout notification.
        try { if (instance_.is_valid()) instance_->notify(ui_element_notify_font_changed, 0, nullptr, 0); }
        catch (...) { if (old) DeleteObject(old); throw; }
        if (old) DeleteObject(old);
    }
    void create() {
        service_enum_t<ui_element> entries;
        ui_element::ptr candidate;
        while (entries.next(candidate)) {
            pfc::string8 name;
            candidate->get_name(name);
            if (eslyric_name(name.c_str())) { element_ = candidate; break; }
        }
        if (element_.is_empty()) throw std::runtime_error("未找到 ESLyric UI 元素，请安装并启用 foo_uie_eslyric");
        auto config = element_->get_default_configuration();
        if (config.is_empty()) throw std::runtime_error("ESLyric 未提供默认面板配置");
        auto store=fb2k::configStore::get();
        auto saved=store->getConfigBlob("smartshuffle.lyrics.panel.config");
        if(!saved->size())saved=store->getConfigBlob("ui.elem.36A795A3-110B-4398-995A-84CEA2B13427.config");
        if(saved->size())config=ui_element_config::g_create(element_->get_guid(),saved->data(),saved->size());
        visible_ = true;
        instance_ = element_->instantiate(parent_, config, ui_element_instance_callback_get_ptr());
        if (instance_.is_empty()) throw std::runtime_error("ESLyric 未返回面板实例");
        window_ = instance_->get_wnd();
        if(window_){
            SetWindowLongPtrW(window_,GWL_STYLE,GetWindowLongPtrW(window_,GWL_STYLE)&~WS_BORDER);
            SetWindowLongPtrW(window_,GWL_EXSTYLE,GetWindowLongPtrW(window_,GWL_EXSTYLE)&~(WS_EX_CLIENTEDGE|WS_EX_STATICEDGE));
        }
        if (!healthy()) throw std::runtime_error("ESLyric 未将歌词窗口创建在请求的主题面板内");
        instance_->notify(ui_element_notify_colors_changed, 0, nullptr, 0);
        instance_->notify(ui_element_notify_font_changed, 0, nullptr, 0);
        // Force an initial visibility notification through set_visible().
        visible_ = false;
    }
    void set_visible(bool visible) {
        const bool changed = visible_ != visible;
        visible_ = visible;
        if (!healthy()) return;
        if(!visible)persist_configuration();
        if (changed) instance_->notify(ui_element_notify_visibility_changed, visible ? 1 : 0, nullptr, 0);
        ShowWindow(window_, visible ? SW_SHOWNOACTIVATE : SW_HIDE);
    }
    void persist_configuration() noexcept {
        if(instance_.is_empty())return;
        try{
            auto cfg=instance_->get_configuration();std::string data(static_cast<const char*>(cfg->get_data()),cfg->get_data_size());
            if(data!=lastConfiguration_){fb2k::configStore::get()->setConfigBlob("smartshuffle.lyrics.panel.config",data.data(),data.size());lastConfiguration_=std::move(data);}
        }catch(...){}
    }
    void release() noexcept {
        persist_configuration();
        visible_ = false;
        // SDK explicitly permits destroying the instance window before releasing
        // its service. Keep callback and font valid for WM_DESTROY and its destructor.
        if (window_ && in_this_process(window_) && GetParent(window_) == parent_)
            DestroyWindow(window_);
        window_ = nullptr;
        instance_.release();
        element_.release();
        ui_element_instance_callback_release();
        if (font_) DeleteObject(font_);
        font_ = nullptr;
        dpi_ = 0;
        parent_ = nullptr;
    }
};

LyricsHost::LyricsHost() : impl_(std::make_unique<Impl>()) {}
LyricsHost::~LyricsHost() = default;
nlohmann::json LyricsHost::update(const nlohmann::json& request) { return impl_->update(request); }
nlohmann::json LyricsHost::status() const { return impl_->status(); }
}
