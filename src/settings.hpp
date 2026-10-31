#pragma once
#include <functional>
namespace native_ss {
void set_layout_reset_handler(std::function<void()> handler);
void request_layout_reset();
void open_settings();
}
