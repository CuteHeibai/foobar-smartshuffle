#include "menu_bridge.hpp"
#include <stdexcept>

namespace native_ss {
using json=nlohmann::json;
void MenuBridge::cancel(){commands_.clear();main_.release();context_.release();token_.clear();next_=1;}
json MenuBridge::serialize(menu_tree_item::ptr node){
    json out={{"label",node->name()},{"disabled",(node->flags()&menu_flags::disabled)!=0},
        {"checked",(node->flags()&(menu_flags::checked|menu_flags::radiochecked))!=0}};
    if(node->isSeparator()){out["separator"]=true;return out;}
    if(node->isCommand()){unsigned id=next_++;commands_[id]=node;out["command"]=id;}
    if(node->isSubmenu()){
        out["children"]=json::array();
        for(size_t i=0;i<node->childCount();++i)out["children"].push_back(serialize(node->childAt(i)));
    }
    return out;
}
json MenuBridge::open_main(const std::string& root){
    static const std::map<std::string,GUID> roots={{"file",mainmenu_groups::file},{"edit",mainmenu_groups::edit},
        {"view",mainmenu_groups::view},{"playback",mainmenu_groups::playback},{"library",mainmenu_groups::library},{"help",mainmenu_groups::help}};
    auto at=roots.find(root);if(at==roots.end())throw std::runtime_error("未知菜单");
    cancel();token_=std::to_string(++sequence_);main_=mainmenu_manager_v2::get();main_->instantiate(at->second);
    auto tree=main_->generate_menu(mainmenu_manager::flag_view_full|mainmenu_manager::flag_show_shortcuts);
    auto item=serialize(tree);return {{"token",token_},{"items",item.value("children",json::array())}};
}
json MenuBridge::open_context(metadb_handle_list_cref tracks){
    if(tracks.get_count()==0)throw std::runtime_error("没有选中的歌曲");
    cancel();token_=std::to_string(++sequence_);context_=contextmenu_manager_v2::get();
    context_->init_context(tracks,contextmenu_manager::flag_view_full|contextmenu_manager::flag_show_shortcuts);
    auto tree=context_->build_menu();auto item=serialize(tree);
    json result={{"token",token_},{"items",item.value("children",json::array())},{"selected_count",tracks.get_count()}};
    if(tracks.get_count()==1)result["track_id"]=std::string(tracks[0]->get_path())+"|"+std::to_string(tracks[0]->get_subsong_index());
    return result;
}
void MenuBridge::execute(const std::string& token,unsigned command){
    auto at=commands_.find(command);
    if(token!=token_||at==commands_.end())throw std::runtime_error("菜单已变化，请重新打开");
    auto item=at->second;
    if(item->flags()&menu_flags::disabled)throw std::runtime_error("该命令当前不可用");
    // Keep the selected node alive across modal dialogs or reentrant commands.
    item->execute({});cancel();
}
}
