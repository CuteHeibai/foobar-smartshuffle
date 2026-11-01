#pragma once
#include "json.hpp"
#include <functional>
namespace native_ss {
using DialogDispatch=std::function<nlohmann::json(nlohmann::json)>;
void set_dialog_handlers(DialogDispatch dispatch,std::function<nlohmann::json()> state);
void open_native_preference();
void open_updates(bool check=false);
bool themed_installation();
void close_native_dialogs();
}
