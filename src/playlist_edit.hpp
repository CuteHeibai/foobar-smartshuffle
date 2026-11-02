#pragma once
// Included after the host identity helpers, inside the component namespace.
metadb_handle_ptr handle_id(const std::string& id){
    auto cut=id.rfind('|');if(cut==std::string::npos)throw std::runtime_error("歌曲标识无效");
    auto text=id.substr(cut+1);size_t used=0;auto sub=std::stoul(text,&used);if(used!=text.size()||sub>UINT_MAX)throw std::runtime_error("子曲目标识无效");
    metadb_handle_ptr h;metadb::get()->handle_create(h,make_playable_location(id.substr(0,cut).c_str(),unsigned(sub)));return h;
}
size_t edit_playlist(const json& req,const char* field="playlist_guid"){
    auto pm=playlist_manager_v5::get();auto pi=pm->find_playlist_by_guid(parseguid(req.at(field).get<std::string>()));
    if(pi>=pm->get_playlist_count())throw std::runtime_error("歌单已变化，请重新选择");
    pfc::string8 name;pm->playlist_get_name(pi,name);if(name==Managed||name=="__verdant_np__"||name==Library)throw std::runtime_error("内部歌单不能编辑");return pi;
}
bool playlist_writable(size_t pi){return playlist_manager::get()->playlist_lock_get_filter_mask(pi)==0;}
std::vector<size_t> checked_order(const json& value,size_t count){
    auto order=value.get<std::vector<size_t>>();if(order.size()!=count)throw std::runtime_error("列表长度已变化");
    std::vector<bool> seen(count);for(auto i:order){if(i>=count||seen[i])throw std::runtime_error("排序不是完整排列");seen[i]=true;}return order;
}
metadb_handle_list selected_handles(const json& req){
    metadb_handle_list selected;
    if(req.contains("playlist_guid")){
        auto pi=edit_playlist(req);auto pm=playlist_manager::get();auto indices=req.at("items").get<std::vector<size_t>>();auto ids=req.at("tracks").get<std::vector<std::string>>();
        if(ids.size()!=indices.size())throw std::runtime_error("所选歌曲已变化");std::set<size_t> seen;
        for(size_t j=0;j<indices.size();++j){metadb_handle_ptr h;auto at=indices[j];if(!seen.insert(at).second||at>=pm->playlist_get_item_count(pi)||!pm->playlist_get_item_handle(h,pi,at)||idof(h)!=ids[j])throw std::runtime_error("所选歌曲已变化，请重新选择");selected.add_item(h);}
    }else for(auto& id:req.at("tracks").get<std::vector<std::string>>())selected.add_item(handle_id(id));
    if(!selected.get_count())throw std::runtime_error("没有选中的歌曲");return selected;
}
