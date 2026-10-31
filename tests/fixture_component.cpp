// Disposable-host fixture only. Never included in the user installation or delivery payload.
#include <foobar2000/SDK/foobar2000.h>
#include "json.hpp"
#include <filesystem>
#include <fstream>
#include <map>
DECLARE_COMPONENT_VERSION("Smart Shuffle acceptance fixture","1.0.0","Disposable test-player only")
VALIDATE_COMPONENT_FILENAME("foo_ssfixture.dll")
namespace {
using json=nlohmann::json;namespace fs=std::filesystem;
fs::path root;UINT_PTR timer;std::string last;
std::wstring wide(const std::string& s){int n=MultiByteToWideChar(CP_UTF8,0,s.c_str(),-1,nullptr,0);std::wstring r(n,0);MultiByteToWideChar(CP_UTF8,0,s.c_str(),-1,r.data(),n);r.pop_back();return r;}
void CALLBACK run(HWND,UINT,UINT_PTR,DWORD){try{
    std::ifstream f(root/L"fixture-request.json");if(!f)return;json q;f>>q;auto id=q.at("id").get<std::string>();if(id==last)return;last=id;
    auto pm=playlist_manager::get();json r={{"id",id},{"ok",true}};std::string op=q.at("op");
    if(op=="setup"){
        auto files=q.at("files").get<std::vector<std::string>>();auto name=q.value("name",std::string("SmartShuffle acceptance"));auto pi=pm->find_or_create_playlist(name.c_str());pm->playlist_clear(pi);metadb_handle_list items;
        for(auto& path:files){metadb_handle_ptr h;metadb::get()->handle_create(h,make_playable_location(path.c_str(),0));items.add_item(h);}
        pm->playlist_insert_items(pi,0,items,pfc::bit_array_false());pm->set_active_playlist(pi);playback_control::get()->set_volume(-60);r["playlist"]=pi;
        auto outside=pm->find_or_create_playlist("SmartShuffle external queue");pm->playlist_clear(outside);pm->playlist_insert_items(outside,0,items,pfc::bit_array_false());r["outside"]=outside;
    }else if(op=="play"){pm->playlist_execute_default_action(q.at("playlist").get<size_t>(),q.at("item").get<size_t>());}
    else if(op=="queue"){pm->queue_add_item_playlist(q.at("playlist").get<size_t>(),q.at("item").get<size_t>());}
    else if(op=="rename"){auto name=q.at("name").get<std::string>();pm->playlist_rename(q.at("playlist").get<size_t>(),name.c_str(),name.size());}
    else if(op=="remove"){auto pi=q.at("playlist").get<size_t>(),at=q.at("item").get<size_t>();pfc::bit_array_bittable mask(pm->playlist_get_item_count(pi));mask.set(at,true);pm->playlist_remove_items(pi,mask);}
    else if(op=="seek"){playback_control::get()->playback_seek(q.at("time").get<double>());}
    else if(op=="pause"){playback_control::get()->pause(q.at("paused").get<bool>());}
    else if(op=="cue"){
        auto path=q.at("path").get<std::string>();service_ptr_t<input_decoder> d;input_entry::g_open_for_decoding(d,{},path.c_str(),fb2k::noAbort);
        auto pi=pm->find_or_create_playlist("SmartShuffle CUE acceptance");pm->playlist_clear(pi);metadb_handle_list items;
        playlist_loader::g_path_to_handles_simple(path.c_str(),items,fb2k::noAbort);r["ids"]=json::array();for(auto& h:items)r["ids"].push_back(std::string(h->get_path())+"|"+std::to_string(h->get_subsong_index()));
        pm->playlist_insert_items(pi,0,items,pfc::bit_array_false());r["playlist"]=pi;r["tracks"]=items.get_count();
    }
    else if(op=="status"){
        r["playing"]=playback_control::get()->is_playing();r["position"]=playback_control::get()->playback_get_position();r["queue"]=pm->queue_get_count();r["names"]=json::array();
        for(size_t i=0;i<pm->get_playlist_count();++i){pfc::string8 n;pm->playlist_get_name(i,n);r["names"].push_back({{"index",i},{"name",n.c_str()},{"count",pm->playlist_get_item_count(i)}});}
    }
    std::ofstream out(root/L"fixture-response.json",std::ios::trunc);out<<r.dump();
}catch(const std::exception& e){std::ofstream out(root/L"fixture-response.json",std::ios::trunc);out<<json({{"id",last},{"ok",false},{"error",e.what()}}).dump();}}
class Life:public initquit{
 void on_init()override{pfc::string8 p;filesystem::g_get_native_path(core_api::get_profile_path(),p);root=wide(p.c_str());timer=SetTimer(nullptr,0,100,run);}
 void on_quit()override{KillTimer(nullptr,timer);}
};initquit_factory_t<Life> life;
}
