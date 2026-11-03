#pragma once
#include <functional>
namespace native_ss {
void set_layout_reset_handler(std::function<void()> handler);
void request_layout_reset();
bool personal_library_enabled();
void set_personal_library_enabled(bool enabled);
void set_personal_library_handler(std::function<void(bool)> handler);
void open_settings();
}
