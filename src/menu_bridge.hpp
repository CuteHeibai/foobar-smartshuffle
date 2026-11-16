#pragma once
#include <foobar2000/SDK/foobar2000.h>
#include "json.hpp"
#include <map>

namespace native_ss {
enum class Transport { none, play, play_pause, next, previous };
class MenuBridge {
public:
    nlohmann::json open_main(const std::string& root);
    nlohmann::json open_context(metadb_handle_list_cref tracks);
    Transport execute(const std::string& token, unsigned command);
    void cancel();
private:
    nlohmann::json serialize(menu_tree_item::ptr node);
    std::map<unsigned,menu_tree_item::ptr> commands_;
    service_ptr_t<mainmenu_manager_v2> main_;
    service_ptr_t<contextmenu_manager_v2> context_;
    std::string token_;
    unsigned next_=1;
    bool playbackMenu_=false;
    uint64_t sequence_=0;
};
}
