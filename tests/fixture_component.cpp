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
class SettingsCallback:public preferences_page_callback {public:void on_state_changed()override{}};
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
    else if(op=="clear_queue"){pm->queue_flush();}
    else if(op=="cleanup"){
        if(playback_control::get()->is_playing())throw std::runtime_error("Stop disposable test playback before cleanup");
        pm->queue_flush();r["removed"]=json::array();
        for(size_t i=pm->get_playlist_count();i-->0;){pfc::string8 name;pm->playlist_get_name(i,name);std::string n=name.c_str();
            if(n.rfind("Mode acceptance ",0)==0||n.rfind("Recycle acceptance ",0)==0||n.rfind("Failed prefix ",0)==0||n.rfind("All failed ",0)==0||n=="SmartShuffle acceptance"||n=="SmartShuffle renamed"||n=="SmartShuffle external queue"||n=="SmartShuffle CUE acceptance"){
                if(pm->remove_playlist(i))r["removed"].push_back(n);
            }
        }
    }
    else if(op=="focus"){pm->playlist_set_focus_item(q.at("playlist").get<size_t>(),q.at("item").get<size_t>());}
    else if(op=="settings"){
        service_enum_t<preferences_page> pages;preferences_page::ptr base;preferences_page_v3::ptr page;bool found=false;
        while(pages.next(base))if((page &= base)&&std::string(page->get_name())=="智能随机"){
            found=true;auto callback=fb2k::service_new<SettingsCallback>();auto instance=page->instantiate(core_api::get_main_window(),callback);
            r["state"]=instance->get_state();r["window"]=IsWindow(instance->get_wnd())!=FALSE;
            if(q.value("reset",false)){instance->reset();r["draft_state"]=instance->get_state();instance->apply();r["applied_state"]=instance->get_state();}
            DestroyWindow(instance->get_wnd());instance.release();break;
        }
        r["found"]=found;
    }
    else if(op=="items"){
        metadb_handle_list list;pm->playlist_get_all_items(q.at("playlist").get<size_t>(),list);r["items"]=json::array();
        for(auto& h:list)r["items"].push_back(std::string(h->get_path())+"|"+std::to_string(h->get_subsong_index()));
    }
    else if(op=="window"){
        auto action=q.value("action",std::string("status"));
        if(action!="status"){
            CLSID clsid{};if(FAILED(CLSIDFromProgID(L"UIWizard",&clsid)))throw std::runtime_error("UIWizard not registered");
            IDispatch* object=nullptr;if(FAILED(CoCreateInstance(clsid,nullptr,CLSCTX_INPROC_SERVER,IID_IDispatch,reinterpret_cast<void**>(&object))))throw std::runtime_error("UIWizard COM unavailable");
            const std::map<std::string,std::wstring> methods={{"max",L"ToggleMaximize"},{"min",L"WindowMinimize"},{"restore",L"WindowRestore"},{"unmax",L"ExitMaximize"},{"resize",L"SetWindowSize"},{"move",L"SetWindowPosition"}};
            auto name=methods.at(action);LPOLESTR names=name.data();DISPID id{};HRESULT hr=object->GetIDsOfNames(IID_NULL,&names,1,LOCALE_USER_DEFAULT,&id);
            VARIANT values[2]{};DISPPARAMS args{};
            if(action=="resize"||action=="move"){
                values[0].vt=values[1].vt=VT_I4;
                values[0].lVal=q.at(action=="resize"?"h":"y").get<int>();values[1].lVal=q.at(action=="resize"?"w":"x").get<int>();
                args.rgvarg=values;args.cArgs=2;
            }
            if(SUCCEEDED(hr))hr=object->Invoke(id,IID_NULL,LOCALE_USER_DEFAULT,DISPATCH_METHOD,&args,nullptr,nullptr,nullptr);object->Release();
            if(FAILED(hr))throw std::runtime_error("UIWizard action failed");
        }
        auto hwnd=core_api::get_main_window();RECT bounds{};GetWindowRect(hwnd,&bounds);
        r["maximized"]=IsZoomed(hwnd)!=FALSE;r["minimized"]=IsIconic(hwnd)!=FALSE;r["x"]=bounds.left;r["y"]=bounds.top;r["w"]=bounds.right-bounds.left;r["h"]=bounds.bottom-bounds.top;
    }
    else if(op=="cue"){
        auto path=q.at("path").get<std::string>();service_ptr_t<input_decoder> d;input_entry::g_open_for_decoding(d,{},path.c_str(),fb2k::noAbort);
        auto pi=pm->find_or_create_playlist("SmartShuffle CUE acceptance");pm->playlist_clear(pi);metadb_handle_list items;
        playlist_loader::g_path_to_handles_simple(path.c_str(),items,fb2k::noAbort);r["ids"]=json::array();for(auto& h:items)r["ids"].push_back(std::string(h->get_path())+"|"+std::to_string(h->get_subsong_index()));
        pm->playlist_insert_items(pi,0,items,pfc::bit_array_false());r["playlist"]=pi;r["tracks"]=items.get_count();
    }
    else if(op=="status"){
        r["playing"]=playback_control::get()->is_playing();r["position"]=playback_control::get()->playback_get_position();r["playing_playlist"]=pm->get_playing_playlist();r["queue"]=pm->queue_get_count();r["names"]=json::array();
        for(size_t i=0;i<pm->get_playlist_count();++i){pfc::string8 n;pm->playlist_get_name(i,n);r["names"].push_back({{"index",i},{"name",n.c_str()},{"count",pm->playlist_get_item_count(i)}});}
    }
    std::ofstream out(root/L"fixture-response.json",std::ios::trunc);out<<r.dump();
}catch(const std::exception& e){std::ofstream out(root/L"fixture-response.json",std::ios::trunc);out<<json({{"id",last},{"ok",false},{"error",e.what()}}).dump();}}
class Life:public initquit{
 void on_init()override{pfc::string8 p;filesystem::g_get_native_path(core_api::get_profile_path(),p);root=wide(p.c_str());timer=SetTimer(nullptr,0,100,run);}
 void on_quit()override{KillTimer(nullptr,timer);}
};initquit_factory_t<Life> life;
}
