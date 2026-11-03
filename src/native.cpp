#include <foobar2000/SDK/foobar2000.h>
#include "core.hpp"
#include "scanner.hpp"
#include "lyrics_host.hpp"
#include "menu_bridge.hpp"
#include "settings.hpp"
#include "recycle.hpp"
#include "metadata_worker.hpp"
#include "hover_focus.hpp"
#include "version.hpp"
#include "updater.hpp"
#include "native_dialogs.hpp"
#include "integration_switch.hpp"
#include "personal_store.hpp"
#include <fstream>
#include <map>
#include <set>
#include <deque>
#include <chrono>
#include <random>
#include <filesystem>
#include <optional>
#include <future>
#include <shlobj.h>

DECLARE_COMPONENT_VERSION("Smart Shuffle · 二维随机偏好",SS_VERSION,"本地随机偏好：每轮全覆盖，听歌频率与音频风格二维调节。\n源码随本机安装包提供。")
VALIDATE_COMPONENT_FILENAME("foo_smartshuffle.dll")

namespace {
using json=nlohmann::json;
namespace fs=std::filesystem;
using Clock=std::chrono::steady_clock;
unsigned privateFontCount=0;
constexpr auto Managed="__smartshuffle__";
constexpr auto Library="__smartshuffle_library__";
std::wstring wide(const std::string& s){if(s.empty())return {};int n=MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),nullptr,0);std::wstring r(n,0);MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),r.data(),n);return r;}
std::string narrow(const std::wstring& s){if(s.empty())return {};int n=WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),nullptr,0,nullptr,nullptr);std::string r(n,0);WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),r.data(),n,nullptr,nullptr);return r;}
fs::path local_path(const char* s){
    wchar_t exe[MAX_PATH*4]{};GetModuleFileNameW(nullptr,exe,MAX_PATH*4);const auto base=fs::path(exe).parent_path();
    std::string text=s;if(text.rfind("file-relative://",0)==0)return (base/fs::path(wide(text.substr(16)))).lexically_normal();
    pfc::string8 out;fs::path path;if(filesystem::g_get_native_path(s,out))path=fs::path(wide(out.c_str()));else path=fs::path(wide(s));
    return path.is_relative()?(base/path).lexically_normal():path;
}
void load_private_fonts(){
    try{
    if(native_ss::integration_original())return;
    auto folder=local_path(core_api::get_profile_path())/L"smartshuffle"/L"fonts";
    wchar_t module[32768]{};GetModuleFileNameW(core_api::get_my_instance(),module,32768);
    auto component=fs::path(module).parent_path()/L"fonts";
    for(auto name:{L"Inter-Regular.ttf",L"Inter-Medium.ttf",L"Inter-SemiBold.ttf"}){
        auto path=folder/name;if(!fs::exists(path))path=component/name;
        if(fs::exists(path))privateFontCount+=AddFontResourceExW(path.c_str(),FR_PRIVATE,nullptr);
    }
    }catch(...){/* Missing font resources use Windows font fallback. */}
}
FB2K_ON_INIT_STAGE(load_private_fonts,init_stages::before_config_read);
std::string idof(const metadb_handle_ptr& h){return std::string(h->get_path())+"|"+std::to_string(h->get_subsong_index());}
std::string guidstr(GUID g){wchar_t b[40]{};StringFromGUID2(g,b,40);return narrow(b);}
GUID parseguid(const std::string& s){GUID g{};CLSIDFromString(wide(s).c_str(),&g);return g;}
#include "playlist_edit.hpp"
bool created_during_this_process(const fs::path& p){FILETIME created,exited,kernel,user;WIN32_FILE_ATTRIBUTE_DATA data{};return GetProcessTimes(GetCurrentProcess(),&created,&exited,&kernel,&user)&&GetFileAttributesExW(p.c_str(),GetFileExInfoStandard,&data)&&CompareFileTime(&data.ftLastWriteTime,&created)>=0;}
json readjson(const fs::path& p){std::ifstream f(p,std::ios::binary);if(!f)return json::object();std::string s((std::istreambuf_iterator<char>(f)),{});if(s.rfind("\xEF\xBB\xBF",0)==0)s.erase(0,3);return json::parse(s);}
void writejson(const fs::path& p,const json& j){auto tmp=p;tmp+=L".tmp";{std::ofstream f(tmp,std::ios::binary|std::ios::trunc);auto s=j.dump(-1,' ',false,json::error_handler_t::replace);f.write(s.data(),s.size());if(!f)throw std::runtime_error("无法写入随机偏好状态");}if(!MoveFileExW(tmp.c_str(),p.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法提交随机偏好状态");}
#include "localization.hpp"
int64_t epoch(){return std::chrono::duration_cast<std::chrono::seconds>(std::chrono::system_clock::now().time_since_epoch()).count();}
std::string fingerprint(const metadb_handle_ptr& h){try{
    auto p=local_path(h->get_path());auto stamp=[](const fs::path& f){return std::to_string(fs::file_size(f))+"|"+std::to_string(fs::last_write_time(f).time_since_epoch().count());};
    auto result=idof(h)+"|"+stamp(p)+"|v1";auto ext=p.extension().wstring();for(auto& c:ext)c=towlower(c);
    if(ext==L".cue"){
        std::ifstream cue(p);std::string line;
        while(std::getline(cue,line)){
            auto first=line.find_first_not_of(" \t");if(first==std::string::npos)continue;auto prefix=line.substr(first,4);for(auto& c:prefix)c=char(toupper(static_cast<unsigned char>(c)));if(prefix!="FILE")continue;
            auto a=line.find('"',first+4),b=a==std::string::npos?a:line.find('"',a+1);if(a==std::string::npos||b==std::string::npos)continue;
            auto name=line.substr(a+1,b-a-1);auto file=p.parent_path()/wide(name);if(fs::exists(file))result+="|"+name+"|"+stamp(file);
        }
    }
    return result;
}catch(...){return {};}}
uint64_t seed(){static std::mt19937_64 r(std::random_device{}());return r();}

struct NewTrack {metadb_handle_ptr handle;std::string playlist;size_t index=~size_t(0);bool queued=false;play_control::t_track_command command=play_control::track_command_default;};
struct Preview {uint64_t seed=0,revision=0;std::string token,source;ss::Point point;std::vector<std::string> order;};
class Engine:public play_callback_impl_base,public playlist_callback_impl_base {
public:
    fs::path root;
    ss::PersonalStore personal;
    bool personalReady=true,personalDirty=false,personalHistory=false,personalAwaitingStart=false;
    std::string personalError;
    std::future<void> personalWrite;
    Clock::time_point personalCheckpoint=Clock::now(),personalRetryAfter=Clock::time_point::min();

    bool enabled=true,scanPaused=false,changed=true,dirty=false,quitting=false,inside=false;
    uint64_t revision=1,uiOpen=0,scanRevision=0,uiLayoutReset=0;
    std::string source,lastRequest,error,nowId;
    std::map<std::string,ss::Round> rounds;
    std::set<std::string> temporarySources;
    std::map<std::string,std::vector<int64_t>> recent;
    json cache=json::object(),response=json::object();
    std::vector<ss::Track> tracks;
    std::map<std::string,metadb_handle_ptr> handles;
    std::optional<Preview> preview;
    std::future<Preview> previewWork;bool previewDirty=false,autoApply=false;
    struct SeekTarget {std::string id;double seconds;Clock::time_point expires;};
    std::optional<SeekTarget> pendingSeek;
    play_control::t_track_command startCommand=play_control::track_command_default;
    std::map<std::string,double> lifetime;double countAtStart=0;
    std::map<std::string,bool> roundAudio;
    bool accountingPlaying=false,accountingPaused=false;
    std::unique_ptr<native_ss::Scanner> scanner;
    std::unique_ptr<native_ss::LyricsHost> lyrics;
    std::unique_ptr<native_ss::MetadataWorker> metadata;json metadataState=json::object();
    std::unique_ptr<LocalLabels> localLabels;
    HoverFocus hoverFocus;
    std::unique_ptr<native_ss::Updater> updater;
    std::string edition="core";bool updateNotified=false;
    std::string themeVersion;
    std::string themeAppearance="dark";
    std::string themeRenderedAppearance;
    uint64_t themeWindow=0;
    bool themeUIWizard=false,themeChromeReady=false;
    json themeLayout=json::object();
    native_ss::MenuBridge nativeMenus;
    native_ss::RecycleManager recycle;
    std::optional<size_t> pendingMode;
    std::optional<t_playback_queue_item> nativeBridge;
    std::string nativeBridgeSource;
    std::deque<NewTrack> events;
    std::set<std::string> externalQueue,queuedStarts;
    std::vector<std::pair<std::string,bool>> queueSnapshot;
    bool queueFixScheduled=false;
    bool ended=false,statsCounted=false;
    bool managedContext=false,managedRequested=false,eofManaged=false;
    uint64_t eofRevision=0,eofRound=0;
    std::string eofSource;
    std::vector<std::string> eofRemaining;
    double listened=0,duration=0;
    Clock::time_point clock=Clock::now(),lastScan=Clock::now()-std::chrono::seconds(30),lastPublish=Clock::now();
    Engine():play_callback_impl_base(flag_on_playback_starting|flag_on_playback_new_track|flag_on_playback_stop|flag_on_playback_seek|flag_on_playback_pause),playlist_callback_impl_base(playlist_callback::flag_on_items_added|playlist_callback::flag_on_items_removed|playlist_callback::flag_on_items_reordered|playlist_callback::flag_on_playlist_renamed|playlist_callback::flag_on_playlists_removed|playlist_callback::flag_on_playback_order_changed){
        root=local_path(core_api::get_profile_path())/L"smartshuffle";fs::create_directories(root);
        try{auto j=readjson(root/L"store.json");if(j.value("version",1)==1){temporarySources=j.value("temporary_sources",decltype(temporarySources){});lifetime=j.value("lifetime",decltype(lifetime){});roundAudio=j.value("round_audio",decltype(roundAudio){});enabled=j.value("enabled",true);source=j.value("source",std::string{});rounds=j.value("rounds",decltype(rounds){});recent=j.value("recent",decltype(recent){});scanPaused=j.value("scanPaused",false);}}catch(const std::exception& e){error=std::string("恢复轮次失败，已保留原文件：")+e.what();}
        try{auto j=readjson(root/L"features.json");if(j.is_object())cache=std::move(j);}catch(...){error="音频特征缓存无法读取，将重新分析";}
        lyrics=std::make_unique<native_ss::LyricsHost>();
        try{if(readjson(root/L"store.json").value("appearance",std::string("dark"))=="light")themeAppearance="light";}catch(...){}
        metadata=std::make_unique<native_ss::MetadataWorker>(root);
        auto hasTheme=fs::exists(root.parent_path()/L"verdant"/L"main.js");
        try{edition=native_ss::installation_edition(readjson(root/L"installation.json"),hasTheme);}catch(...){edition=hasTheme?"full":"core";}
        if(edition!="full")edition="core";
        personalHistory=edition=="full"&&native_ss::personal_library_enabled();
        if(fs::exists(root/L"personal.json"))try{personal.load(readjson(root/L"personal.json"),epoch());personalDirty=true;}
        catch(const std::exception& e){personalReady=false;personalError=std::string("个人音乐记录无法读取，已保留原文件：")+e.what();}

        lyrics->set_light(themeAppearance=="light");
        if(edition=="full")localLabels=std::make_unique<LocalLabels>(root.parent_path()/L"verdant"/L"locale"/L"zh-CN.json");
        wchar_t componentFile[32768]{};GetModuleFileNameW(core_api::get_my_instance(),componentFile,32768);
        updater=std::make_unique<native_ss::Updater>(root,SS_VERSION,edition,fs::path(componentFile).parent_path()/L"update-helper");
        native_ss::set_dialog_handlers([this](json req){dispatch(req);changed=true;publish();return response;},[this]{return dialog_state();});
        scanner=std::make_unique<native_ss::Scanner>(root);scanner->pause(scanPaused);
        if(index_of_source()==~size_t(0))source.clear();
        if(source.empty())select_source(playlist_manager::get()->get_active_playlist());else refresh();
        if(!fs::exists(root/L"request.json"))lastRequest.clear();else try{auto pending=readjson(root/L"request.json");if(!created_during_this_process(root/L"request.json"))lastRequest=pending.value("id",std::string{});}catch(...){}
        metadb_handle_ptr h;if(playback_control::get()->get_now_playing(h)){on_playback_new_track(h);accountingPaused=playback_control::get()->is_paused();}
        try{uiLayoutReset=readjson(root/L"store.json").value("layout_reset",uint64_t(0));}catch(...){}
        native_ss::set_layout_reset_handler([this]{++uiLayoutReset;save();changed=true;publish();});
        native_ss::set_personal_library_handler([this](bool value){
            accrue();close_personal("stopped");personalAwaitingStart=false;
            personalHistory=edition=="full"&&value;
            metadb_handle_ptr h;
            if(personalHistory&&personalReady&&playback_control::get()->get_now_playing(h)){
                personal.begin(personal_track(h),epoch());personalDirty=true;
            }
            changed=true;publish();
        });
        publish();
    }
    ~Engine(){quitting=true;accrue();close_personal("interrupted");save_personal(true);native_ss::set_personal_library_handler({});native_ss::close_native_dialogs();native_ss::set_dialog_handlers({},{});native_ss::set_layout_reset_handler({});remove_owned_queue();lyrics.reset();metadata.reset();scanner.reset();save();}
    json personal_track(const metadb_handle_ptr& h){
        file_info_impl info;std::string title,artist,album;double length=0;
        if(h->get_info(info)){
            auto get=[&](const char* key){auto v=info.meta_get(key,0);return v?std::string(v):std::string{};};
            title=get("TITLE");artist=get("ARTIST");album=get("ALBUM");length=info.get_length();
        }
        if(title.empty())title=narrow(local_path(h->get_path()).stem().wstring());
        if(!(length>0)){
            metadb_handle_ptr current;auto pc=playback_control::get();
            if(pc->get_now_playing(current)&&current==h)length=pc->playback_get_length_ex();
        }
        return {{"id",idof(h)},{"title",title},{"artist",artist},{"album",album},{"duration",std::isfinite(length)&&length>0?length:0}};
    }
    void close_personal(const char* outcome){
        if(!personalHistory||!personalReady||!personal.active())return;
        personal.finish(outcome,epoch());personalDirty=true;changed=true;
    }
    void save_personal(bool force=false){
        if(personalWrite.valid()){
            if(!force&&personalWrite.wait_for(std::chrono::seconds(0))!=std::future_status::ready)return;
            try{personalWrite.get();personalError.clear();}catch(const std::exception& e){personalError=std::string("个人音乐记录保存失败：")+e.what();personalDirty=true;personalRetryAfter=Clock::now()+std::chrono::seconds(1);changed=true;}
        }
        if(!personalReady||!personalDirty||(!force&&Clock::now()<personalRetryAfter))return;
        auto data=personal.dump();auto path=root/L"personal.json";personalDirty=false;
        if(force){try{writejson(path,data);}catch(const std::exception& e){console::print((std::string("Smart Shuffle personal: ")+e.what()).c_str());}return;}
        personalWrite=std::async(std::launch::async,[path,data=std::move(data)]{writejson(path,data);});
    }
    size_t index_of_source(){if(source.empty())return ~size_t(0);return playlist_manager_v5::get()->find_playlist_by_guid(parseguid(source));}
    std::string source_name(){auto p=index_of_source();pfc::string8 s;if(p!=~size_t(0))playlist_manager::get()->playlist_get_name(p,s);return s.c_str();}
    bool internal(size_t p){pfc::string8 n;return p!=~size_t(0)&&playlist_manager::get()->playlist_get_name(p,n)&&n==Managed;}
    ss::Round& round(){return rounds[source];}
    void next_round(){ss::begin_round(round(),tracks,seed(),recent_counts());roundAudio[source]=false;}
    std::map<std::string,int> recent_counts(){std::map<std::string,int> counts;int64_t cutoff=epoch()-30*86400;for(auto& [id,times]:recent){times.erase(std::remove_if(times.begin(),times.end(),[&](int64_t t){return t<cutoff;}),times.end());counts[id]=int(times.size());}return counts;}
    ss::Track describe(metadb_handle_ptr h){
        ss::Track t;t.id=idof(h);file_info_impl info;
        if(h->get_info(info)){t.duration=info.get_length();auto get=[&](const char* k){auto p=info.meta_get(k,0);return p?std::string(p):std::string{};};t.title=get("TITLE");t.artist=get("ARTIST");t.genre=get("GENRE");}
        if(t.title.empty())t.title=narrow(local_path(h->get_path()).stem().wstring());
        try{pfc::string8 count;titleformat_object::ptr script;titleformat_compiler::get()->compile_safe(script,"$if2(%play_count%,0)");h->format_title(nullptr,count,script,nullptr);t.play_count=std::max(0.0,std::stod(count.c_str()));}catch(...){}
        t.play_count=std::max(t.play_count,lifetime[t.id]);lifetime[t.id]=t.play_count;
        auto fp=fingerprint(h);if(cache.contains(fp)&&cache[fp].contains("features"))try{t.features=cache[fp]["features"].get<std::vector<double>>();}catch(...){}
        return t;
    }
    void refresh(){
        auto pi=index_of_source();tracks.clear();handles.clear();if(pi==~size_t(0))return;
        metadb_handle_list list;playlist_manager::get()->playlist_get_all_items(pi,list);
        for(auto& h:list){auto id=idof(h);if(handles.count(id))continue;handles[id]=h;tracks.push_back(describe(h));}
        ss::reconcile(round(),tracks,seed(),recent_counts());
    }
    void select_source(size_t pi){auto pm=playlist_manager_v5::get();if(pi>=pm->get_playlist_count()||internal(pi))return;source=guidstr(pm->playlist_get_guid(pi));pfc::string8 name;pm->playlist_get_name(pi,name);if(name=="__verdant_np__"||name==Library)temporarySources.insert(source);refresh();lastScan=Clock::now()-std::chrono::seconds(30);changed=true;}
    std::vector<ss::Track> remaining_tracks(){std::set<std::string> ids(round().remaining.begin(),round().remaining.end());std::vector<ss::Track> ret;for(auto& t:tracks)if(ids.count(t.id))ret.push_back(t);return ret;}
    json track_json(const std::string& id){auto it=std::find_if(tracks.begin(),tracks.end(),[&](const ss::Track& t){return t.id==id;});if(it!=tracks.end())return {{"id",id},{"title",it->title},{"artist",it->artist},{"duration",it->duration},{"analyzed",!it->features.empty()}};return {{"id",id},{"title",id},{"artist",""}};}
    json list_json(const std::vector<std::string>& ids,size_t limit=SIZE_MAX){json a=json::array();for(size_t i=0;i<ids.size()&&i<limit;++i)a.push_back(track_json(ids[i]));return a;}
    void save(){try{writejson(root/L"store.json",{{"version",1},{"enabled",enabled},{"source",source},{"rounds",rounds},{"temporary_sources",temporarySources},{"layout_reset",uiLayoutReset},{"recent",recent},{"lifetime",lifetime},{"round_audio",roundAudio},{"scanPaused",scanPaused},{"appearance",themeAppearance}});}catch(const std::exception& e){error=e.what();}}
    json dialog_state(){
        json j={{"component",SS_VERSION},{"revision",revision},{"preview_pending",previewDirty||previewWork.valid()},{"point",source.empty()?ss::Point{}:round().preference},{"update",updater->status()}};
        j["preview"]=preview?json{{"token",preview->token},{"revision",preview->revision},{"point",preview->point},{"tracks",list_json(preview->order,8)}}:json(nullptr);return j;
    }
    json snapshot(){
        json j={{"version",1},{"pid",GetCurrentProcessId()},{"component",SS_VERSION},{"revision",revision},{"request_id",lastRequest},{"enabled",enabled},{"source",source},{"source_name",source_name()},{"ui_open",uiOpen},{"error",error},{"response",response},{"managed_playlist",Managed}};
        if(!source.empty()){j["point"]=round().preference;j["round"]=round().number;j["remaining_count"]=round().remaining.size();j["remaining"]=list_json(round().remaining);}
        else{j["point"]={{"x",0},{"y",0}};j["round"]=1;j["remaining_count"]=0;j["remaining"]=json::array();}
        j["ui_layout_reset"]=uiLayoutReset;j["preview_pending"]=previewDirty||previewWork.valid();j["seek_pending"]=pendingSeek.has_value();j["now_id"]=nowId;j["queue"]=json::array();
        auto pm=playlist_manager::get();pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);
        j["playlists"]=json::array();for(size_t i=0;i<pm->get_playlist_count();++i){pfc::string8 name;pm->playlist_get_name(i,name);j["playlists"].push_back({{"index",i},{"guid",guidstr(playlist_manager_v5::get()->playlist_get_guid(i))},{"name",name.c_str()},{"writable",playlist_writable(i)},{"reorderable",playlist_reorderable(i)}});}
        bool bridgeUsed=false;for(auto& v:q)if(!owned_queue(v,bridgeUsed))j["queue"].push_back(track_json(idof(v.m_handle)));
        j["native_next"]=json::array();if(!enabled){
            auto pi=index_of_source();size_t at=~size_t(0);if(pi<pm->get_playlist_count()){
                metadb_handle_list list;pm->playlist_get_all_items(pi,list);for(size_t i=0;i<list.get_count();++i)if(idof(list[i])==nowId){at=i;break;}
                auto append=[&](size_t i){auto row=track_json(idof(list[i]));row["playlist"]=pi;row["item"]=i;j["native_next"].push_back(row);};
                for(size_t i=at==~size_t(0)?0:at+1;i<list.get_count();++i)append(i);
                if(pm->playback_order_get_active()==1&&at!=~size_t(0))for(size_t i=0;i<=at;++i)append(i);
            }
        }
        size_t completed=0,failed=0;for(auto& t:tracks){auto fp=fingerprint(handles[t.id]);if(cache.contains(fp)){if(cache[fp].contains("features"))++completed;else ++failed;}}
        j["scan"]={{"paused",scanPaused},{"completed",completed},{"failed",failed},{"total",tracks.size()},{"pending",scanner?scanner->pending():0},{"revision",scanRevision}};
        j["theme"]={{"version",themeVersion},{"window",themeWindow},{"ui_wizard",themeUIWizard},{"chrome_ready",themeChromeReady},{"appearance",themeAppearance},{"rendered_appearance",themeRenderedAppearance},{"layout",themeLayout}};
        MONITORINFO display{sizeof(display)};
        if(GetMonitorInfoW(MonitorFromWindow(core_api::get_main_window(),MONITOR_DEFAULTTONEAREST),&display)){
            auto work=display.rcWork;
            j["display"]={{"work_left",work.left},{"work_top",work.top},{"work_width",work.right-work.left},{"work_height",work.bottom-work.top}};
        }
        j["native_order"]=pm->playback_order_get_active();j["order_name"]=pm->playback_order_get_name(pm->playback_order_get_active());j["orders"]=json::array();
        for(size_t i=0;i<pm->playback_order_get_count();++i)j["orders"].push_back({{"index",i},{"name",pm->playback_order_get_name(i)}});
        j["personal"]=personal.summary(nowId);j["personal"]["error"]=personalError;j["personal"]["history_enabled"]=personalHistory;
        j["personal"]["enabled"]=edition=="full"&&native_ss::personal_library_enabled();
        j["personal"]["current"]=personal.active()?personal.page("history",0,1).at("items").at(0):json(nullptr);
        j["metadata"]=metadataState;
        j["update"]=updater?updater->status():json::object();j["edition"]=edition;j["fonts"]={{"family","Inter"},{"private_resources",privateFontCount}};
        j["hover_focus"]={{"installed",hoverFocus.installed()},{"surface",hoverFocus.surface()},{"focused",hoverFocus.focused()},{"routed_wheel",hoverFocus.routed()}};
        j["lyrics_panel"]=lyrics?lyrics->status():json::object();
        if(preview)j["preview"]={{"token",preview->token},{"revision",preview->revision},{"point",preview->point},{"tracks",list_json(preview->order,8)},{"total",preview->order.size()}};
        else j["preview"]=nullptr;
        return j;
    }
    void publish(){
        try{writejson(root/L"state.json",snapshot());}catch(const std::exception& e){console::print((std::string("Smart Shuffle: ")+e.what()).c_str());}
        changed=false;lastPublish=Clock::now();
    }
    void pump_clients(){
        // Independent command files keep CLI clients from overwriting the theme's
        // single-flight request or losing a response to a subsequent UI refresh.
        auto commands=root/L"commands",replies=root/L"replies";
        fs::create_directories(commands);fs::create_directories(replies);
        for(const auto& entry:fs::directory_iterator(commands)){
            if(entry.path().extension()!=L".json")continue;
            auto id=narrow(entry.path().stem().wstring());
            if(id.size()!=32||id.find_first_not_of("0123456789abcdef")!=std::string::npos)continue;
            auto reply=replies/(wide(id)+L".json");
            if(fs::exists(reply)||!created_during_this_process(entry.path())){fs::remove(entry.path());continue;}
            auto saved=response;
            try{auto request=readjson(entry.path());if(request.value("id",std::string{})!=id)throw std::runtime_error("请求标识不一致");dispatch(request);}
            catch(const std::exception& e){response={{"ok",false},{"message",e.what()}};}
            auto result=snapshot();result["request_id"]=id;
            writejson(reply,result);fs::remove(entry.path());response=std::move(saved);changed=true;
        }
    }
    void invalidate(){++revision;if(preview){preview->revision=revision;preview->source=source;preview->token.clear();previewDirty=true;}autoApply=false;changed=true;save();}
    bool owned_queue(const t_playback_queue_item& q,bool& bridgeUsed){
        if(internal(q.m_playlist))return true;
        if(!bridgeUsed&&nativeBridge&&q.m_handle==nativeBridge->m_handle&&q.m_playlist<playlist_manager::get()->get_playlist_count()&&guidstr(playlist_manager_v5::get()->playlist_get_guid(q.m_playlist))==nativeBridgeSource){bridgeUsed=true;return true;}
        return false;
    }
    void remove_owned_queue(){auto pm=playlist_manager::get();pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);pfc::bit_array_bittable mask(q.get_count());bool any=false,bridgeUsed=false;for(size_t i=0;i<q.get_count();++i)if(owned_queue(q[i],bridgeUsed)){mask.set(i,true);any=true;}nativeBridge.reset();nativeBridgeSource.clear();if(any)pm->queue_remove_mask(mask);}
    void rebuild(bool ensureNext=true){
        if(!enabled||source.empty()||inside)return;
        inside=true;
        try{
            auto pm=playlist_manager::get();size_t pi=pm->find_or_create_playlist(Managed),playing=~size_t(0),at=~size_t(0);pm->get_playing_item_location(&playing,&at);
            remove_owned_queue();
            metadb_handle_list add;
            if(playing==pi && at<pm->playlist_get_item_count(pi)){
                pfc::bit_array_bittable remove(pm->playlist_get_item_count(pi));for(size_t i=at+1;i<pm->playlist_get_item_count(pi);++i)remove.set(i,true);
                pm->playlist_remove_items(pi,remove);
            }else{
                pm->playlist_clear(pi);metadb_handle_ptr current;
                if(playback_control::get()->get_now_playing(current))add.add_item(current);
            }
            for(auto& id:round().remaining)if(handles.count(id))add.add_item(handles[id]);
            pm->playlist_insert_items(pi,pm->playlist_get_item_count(pi),add,pfc::bit_array_false());
            // One owned queue entry bridges a manual source/queued track into the managed playlist.
            // All user queue entries retain priority; internal playback naturally follows its tail.
            if(ensureNext && playback_control::get()->is_playing() && playing!=pi && pm->queue_get_count()==0 && !round().remaining.empty()){
                size_t first=pm->playlist_get_item_count(pi)-round().remaining.size();pm->queue_add_item_playlist(pi,first);
            }
            if(playing==pi && pm->playback_order_get_active()!=2)pm->playback_order_set_active(0);
        }catch(const std::exception& e){error=e.what();}
        inside=false;changed=true;
    }
    void queue_changed(playback_queue_callback::t_change_origin origin){
        auto pm=playlist_manager::get();pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);
        std::vector<std::pair<std::string,bool>> next;
        bool own=false,user=false,bridgeUsed=false;
        for(auto& v:q){bool isOwn=owned_queue(v,bridgeUsed);next.emplace_back(idof(v.m_handle),isOwn);own|=isOwn;user|=!isOwn;}
        if(origin==playback_queue_callback::changed_playback_advance && !queueSnapshot.empty() && !queueSnapshot.front().second){queuedStarts.insert(queueSnapshot.front().first);}
        queueSnapshot=std::move(next);
        if(own&&user&&!queueFixScheduled){queueFixScheduled=true;fb2k::inMainThread([this]{queueFixScheduled=false;if(!quitting){remove_owned_queue();changed=true;}});}
        changed=true;
    }
    void queue_event(metadb_handle_ptr h){
        NewTrack e;e.handle=h;e.command=startCommand;size_t pi=~size_t(0),item=~size_t(0);auto pm=playlist_manager_v5::get();pm->get_playing_item_location(&pi,&item);e.index=item;e.queued=queuedStarts.erase(idof(h))>0;
        if(pi!=~size_t(0)&&pi<pm->get_playlist_count())e.playlist=internal(pi)?Managed:guidstr(pm->playlist_get_guid(pi));
        events.push_back(std::move(e));
    }
    void on_playback_starting(play_control::t_track_command c,bool paused)override{accrue();startCommand=c;accountingPaused=paused;if(managedRequested){managedContext=true;managedRequested=false;}else if(c!=play_control::track_command_default&&c!=play_control::track_command_next)managedContext=false;}
    void on_playback_new_track(metadb_handle_ptr h)override{accrue();close_personal(startCommand==play_control::track_command_default?"completed":"skipped");personalAwaitingStart=false;if(personalHistory&&personalReady){personal.begin(personal_track(h),epoch());personalDirty=true;}nowId=idof(h);if(pendingSeek&&pendingSeek->id!=nowId)pendingSeek.reset();listened=0;statsCounted=false;auto t=describe(h);duration=t.duration;countAtStart=t.play_count;clock=Clock::now();queue_event(h);startCommand=play_control::track_command_default;accountingPlaying=true;accountingPaused=playback_control::get()->is_paused();}
    void on_playback_stop(play_control::t_stop_reason r)override{accrue();if(r==play_control::stop_reason_starting_another)personalAwaitingStart=personal.active();else{close_personal(r==play_control::stop_reason_eof?(personalAwaitingStart&&startCommand!=play_control::track_command_default?"skipped":"completed"):r==play_control::stop_reason_shutting_down?"interrupted":"stopped");personalAwaitingStart=false;}if(r!=play_control::stop_reason_starting_another)pendingSeek.reset();accountingPlaying=false;if(r==play_control::stop_reason_eof){ended=true;eofManaged=managedContext;eofRevision=revision;eofSource=source;eofRound=source.empty()?0:round().number;eofRemaining=source.empty()?std::vector<std::string>{}:round().remaining;}}
    void on_playback_seek(double)override{accrue();}
    void on_playback_pause(bool p)override{accrue();accountingPaused=p;}
    void on_items_added(t_size p,t_size,const pfc::list_base_const_t<metadb_handle_ptr>&,const bit_array&)override{markdirty(p);}
    void on_items_removed(t_size p,const bit_array&,t_size,t_size)override{markdirty(p);}
    void on_items_reordered(t_size p,const t_size*,t_size)override{markdirty(p);}
    void on_playlist_renamed(t_size p,const char*,t_size)override{markdirty(p);}
    void on_playback_order_changed(t_size p)override{if(!inside&&enabled&&p!=0)pendingMode=p;changed=true;}
    void on_playlists_removed(const bit_array&,t_size,t_size)override{if(!inside)dirty=true;}
    void markdirty(size_t p){if(!inside&&!internal(p))dirty=true;}
    void process_new(NewTrack e){
        nowId=idof(e.handle);
        if(nativeBridge&&nativeBridge->m_handle==e.handle){nativeBridge.reset();nativeBridgeSource.clear();}
        managedContext=e.playlist==Managed;
        if(!enabled){changed=true;return;}
        if(!e.queued&&!e.playlist.empty()&&e.playlist!=Managed&&e.playlist!=source){auto pi=playlist_manager_v5::get()->find_playlist_by_guid(parseguid(e.playlist));select_source(pi);}
        if(source.empty()){changed=true;return;}
        if(handles.count(nowId)){
            // Items bypassed by the host decoder in the managed sequence were attempted failures.
            if(e.playlist==Managed&&!e.queued&&(e.command==play_control::track_command_next||e.command==play_control::track_command_default)){auto it=std::find(round().remaining.begin(),round().remaining.end(),nowId);if(it!=round().remaining.end()){std::vector<std::string> skipped(round().remaining.begin(),it);for(auto& id:skipped)ss::consume(round(),id);}}
            ss::consume(round(),nowId);
        }
        invalidate();rebuild();
    }
    void make_preview(const json& request,bool fresh){
        if(source.empty()){auto pi=playlist_manager::get()->get_active_playlist();select_source(pi);}
        if(source.empty())throw std::runtime_error("请先选择一个歌单");
        if(fresh||!preview){Preview p;p.seed=seed();p.revision=revision;p.source=source;p.point=round().preference;preview=p;}
        auto& p=*preview;if(p.revision!=revision||p.source!=source){p.revision=revision;p.source=source;}
        p.point.x=std::clamp(request.value("x",p.point.x),-1.0,1.0);p.point.y=std::clamp(request.value("y",p.point.y),-1.0,1.0);
        if(!std::isfinite(p.point.x)||!std::isfinite(p.point.y))throw std::runtime_error("无效的偏好位置");
        p.token.clear();previewDirty=true;changed=true;
    }
    void pump_preview(){
        if(previewWork.valid()&&previewWork.wait_for(std::chrono::seconds(0))==std::future_status::ready){
            auto result=previewWork.get();
            if(preview && !previewDirty && result.revision==revision && result.source==source && result.seed==preview->seed && result.point.x==preview->point.x && result.point.y==preview->point.y){
                preview=std::move(result);changed=true;
                if(autoApply){autoApply=false;auto token=preview->token;dispatch({{"version",1},{"op","apply"},{"token",token}});}
            }
        }
        if(previewDirty && preview && !previewWork.valid()){
            Preview p=*preview;p.token=std::to_string(p.seed)+":"+std::to_string(revision)+":"+std::to_string(seed());
            auto candidates=remaining_tracks();std::optional<ss::Track> anchor;
            for(auto& t:tracks)if(t.id==nowId){anchor=t;break;}
            auto counts=recent_counts();previewDirty=false;
            previewWork=std::async(std::launch::async,[p,candidates=std::move(candidates),anchor=std::move(anchor),counts=std::move(counts)]()mutable{
                p.order=ss::order(candidates,p.point,p.seed,anchor?anchor->id:std::string{},counts,anchor?&*anchor:nullptr);
                if(anchor&&p.order.size()>1&&p.order.front()==anchor->id)std::swap(p.order[0],p.order[1]);
                return p;
            });
        }
    }
    void accrue(){
        auto now=Clock::now();double delta=std::chrono::duration<double>(now-clock).count();clock=now;
        if(personalHistory&&personalReady&&personal.active()&&accountingPlaying&&!accountingPaused){
            auto elapsed=std::max(0.0,delta);personal.listen(elapsed);
            if(now-personalCheckpoint>=std::chrono::seconds(15)){personalCheckpoint=now;personalDirty=true;}
        }
        if(accountingPlaying&&!accountingPaused&&!statsCounted&&!nowId.empty()&&duration>0){
            listened+=std::max(0.0,delta);
            if(!source.empty()&&handles.count(nowId)&&listened>=std::min(.1,duration/4))roundAudio[source]=true;
            if(listened>=std::min(60.0,duration/2)){
                recent[nowId].push_back(epoch());lifetime[nowId]=std::max(lifetime[nowId],countAtStart+1);
                for(auto& t:tracks)if(t.id==nowId)t.play_count=std::max(t.play_count,lifetime[nowId]);
                statsCounted=true;save();
            }
        }
    }

    void set_mode(bool smart,size_t order=0){
        auto pm=playlist_manager::get();
        if(order>=pm->playback_order_get_count())throw std::runtime_error("未知播放顺序");
        inside=true;enabled=smart;remove_owned_queue();
        pm->playback_order_set_active(smart?0:order);
        auto sourceIndex=index_of_source();
        if(!smart&&sourceIndex!=~size_t(0)){
            size_t playing=~size_t(0),current=~size_t(0);pm->get_playing_item_location(&playing,&current);
            // The SDK cannot rebind a playing item to another playlist without restarting
            // audio. A single queue entry rejoins the source at its real successor.
            // Random native modes choose freely; sequential modes must retain position.
            if(internal(playing)&&order<=2){
                metadb_handle_ptr h;size_t at=~size_t(0),count=pm->playlist_get_item_count(sourceIndex);
                if(playback_control::get()->get_now_playing(h)&&pm->playlist_find_item(sourceIndex,h,at)&&count){
                    size_t next=order==2?at:at+1;
                    if(next>=count&&order==1)next=0;
                    if(next<count){
                        pm->set_playing_playlist(sourceIndex);
                        if(pm->queue_get_count()==0){
                            t_playback_queue_item bridge{};bridge.m_playlist=sourceIndex;bridge.m_item=next;
                            pm->playlist_get_item_handle(bridge.m_handle,sourceIndex,next);nativeBridge=bridge;nativeBridgeSource=source;
                            pm->queue_add_item_playlist(sourceIndex,next);
                        }
                    }else{
                        // Last track in non-looping order: leave no managed successors.
                        pfc::bit_array_bittable tail(pm->playlist_get_item_count(playing));
                        for(size_t i=current+1;i<pm->playlist_get_item_count(playing);++i)tail.set(i,true);
                        pm->playlist_remove_items(playing,tail);pm->set_playing_playlist(playing);
                    }
                }else pm->set_playing_playlist(sourceIndex);
            }else pm->set_playing_playlist(sourceIndex);
        }
        inside=false;pendingMode.reset();invalidate();if(smart)rebuild();
    }
    void darken_frame(){
        auto panel=reinterpret_cast<HWND>(static_cast<uintptr_t>(themeWindow));DWORD process=0;
        if(!panel||!IsWindow(panel)||!GetWindowThreadProcessId(panel,&process)||process!=GetCurrentProcessId())return;
        auto rootWindow=GetAncestor(panel,GA_ROOT);
        for(auto w=panel;w&&w!=rootWindow;w=GetParent(w)){
            auto ex=GetWindowLongPtrW(w,GWL_EXSTYLE);auto style=GetWindowLongPtrW(w,GWL_STYLE);
            if(ex&(WS_EX_CLIENTEDGE|WS_EX_STATICEDGE)||style&WS_BORDER){
                SetWindowLongPtrW(w,GWL_EXSTYLE,ex&~(WS_EX_CLIENTEDGE|WS_EX_STATICEDGE));SetWindowLongPtrW(w,GWL_STYLE,style&~WS_BORDER);
                SetWindowPos(w,nullptr,0,0,0,0,SWP_NOMOVE|SWP_NOSIZE|SWP_NOZORDER|SWP_NOACTIVATE|SWP_FRAMECHANGED);
            }
        }
        if(auto module=LoadLibraryW(L"dwmapi.dll")){
            using SetAttribute=HRESULT(WINAPI*)(HWND,DWORD,LPCVOID,DWORD);
            if(auto set=reinterpret_cast<SetAttribute>(GetProcAddress(module,"DwmSetWindowAttribute"))){BOOL dark=themeAppearance!="light";COLORREF color=dark?RGB(0,0,0):RGB(238,242,240);set(rootWindow,20,&dark,sizeof(dark));set(rootWindow,34,&color,sizeof(color));}
            FreeLibrary(module);
        }
    }

    void cleanup_temporary_playlists(){
        auto pm=playlist_manager_v5::get();auto pc=playback_control::get();
        if(!pc->is_playing())remove_owned_queue();
        size_t playing=~size_t(0),item=~size_t(0);pm->get_playing_item_location(&playing,&item);
        pfc::list_t<t_playback_queue_item> queue;pm->queue_get_contents(queue);
        inside=true;
        for(size_t i=pm->get_playlist_count();i-->0;){
            pfc::string8 name;pm->playlist_get_name(i,name);
            bool managed=name==Managed,route=name=="__verdant_np__"||name==Library;
            if(!managed&&!route)continue;
            auto guid=guidstr(pm->playlist_get_guid(i));
            if(route&&!temporarySources.count(guid))continue;
            if(pc->is_playing()&&(i==playing||(managed&&enabled)||(route&&i==index_of_source())))continue;
            bool queued=false;for(auto& q:queue)if(q.m_playlist==i){queued=true;break;}
            if(queued)continue;
            if(pm->get_active_playlist()==i){
                for(size_t j=0;j<pm->get_playlist_count();++j){pfc::string8 other;pm->playlist_get_name(j,other);if(other!=Managed&&other!="__verdant_np__"&&other!=Library){pm->set_active_playlist(j);break;}}
            }
            if(pm->remove_playlist(i)){
                if(route){temporarySources.erase(guid);rounds.erase(guid);roundAudio.erase(guid);if(source==guid){source.clear();tracks.clear();handles.clear();preview.reset();previewDirty=false;}}
                changed=true;
            }
        }
        inside=false;
        if(source.empty())select_source(pm->get_active_playlist());
    }

    void play_source_playlist(size_t pi,bool allowResume=true){
        auto pm=playlist_manager_v5::get();auto pc=playback_control::get();
        auto chosen=guidstr(pm->playlist_get_guid(pi));
        size_t playing=~size_t(0),at=~size_t(0);pm->get_playing_item_location(&playing,&at);
        metadb_handle_ptr current;
        // Clicking the current smart source is a resume, never a replay or new round.
        if(allowResume&&enabled&&source==chosen&&pc->is_playing()&&(playing==pi||internal(playing))&&pc->get_now_playing(current)&&handles.count(idof(current))){
            if(pc->is_paused())pc->pause(false);changed=true;return;
        }
        pendingSeek.reset();select_source(pi);remove_owned_queue();
        // The host default action clears its playback queue. Preserve explicit
        // user inserts around the requested playlist start, retaining FIFO order.
        auto startPlaylist=[&](size_t target){
            pfc::list_t<t_playback_queue_item> queue;pm->queue_get_contents(queue);
            pm->playlist_execute_default_action(target,0);
            if(queue.get_count()){
                pm->queue_flush();
                for(auto& item:queue){
                    if(item.m_playlist<pm->get_playlist_count()&&item.m_item<pm->playlist_get_item_count(item.m_playlist)){
                        metadb_handle_ptr at;pm->playlist_get_item_handle(at,item.m_playlist,item.m_item);
                        if(at==item.m_handle){pm->queue_add_item_playlist(item.m_playlist,item.m_item);continue;}
                    }
                    pm->queue_add_item(item.m_handle);
                }
            }
        };
        if(!enabled){invalidate();startPlaylist(pi);return;}
        if(round().remaining.empty())next_round();
        metadb_handle_list all;for(auto& id:round().remaining)if(handles.count(id))all.add_item(handles[id]);
        if(!all.get_count())throw std::runtime_error("歌单中没有可播放的歌曲");
        // Only the managed projection is replaced; user queue entries and saved seen/order survive.
        auto owned=pm->find_or_create_playlist(Managed);pm->playlist_clear(owned);
        pm->playlist_insert_items(owned,0,all,pfc::bit_array_false());pm->playback_order_set_active(0);
        invalidate();managedRequested=true;startPlaylist(owned);
    }

    void dispatch(const json& req){
        const auto op=req.value("op",std::string("state"));response={{"ok",true}};error.clear();
        if(req.value("version",0)!=1)throw std::runtime_error("不支持的接口版本");
        if(req.contains("theme_version")){themeVersion=req.at("theme_version").get<std::string>();themeWindow=req.value("theme_window",uint64_t(0));themeUIWizard=req.value("ui_wizard",false);hoverFocus.set_surface(reinterpret_cast<HWND>(static_cast<uintptr_t>(themeWindow)));darken_frame();}
        if(req.contains("theme_chrome_ready")){themeChromeReady=req.at("theme_chrome_ready").get<bool>();darken_frame();}
        if(req.contains("theme_color")){
            auto mode=req.at("theme_color").get<std::string>();
            if(mode=="light"||mode=="dark")themeRenderedAppearance=mode;
        }
        if(req.contains("theme_layout")){auto input=req.at("theme_layout");for(auto key:{"width","height","nav","right","info","tools","density","row_height","cover_size","reset"})if(input.contains(key)&&input[key].is_number())themeLayout[key]=input[key];}
        if(op=="theme_appearance"){
            if(edition!="full")throw std::runtime_error("外观切换仅适用于完整主题版");
            auto mode=req.at("appearance").get<std::string>();
            if(mode!="light"&&mode!="dark")throw std::runtime_error("不支持的主题外观");
            themeAppearance=mode;lyrics->set_light(mode=="light");darken_frame();save();response["appearance"]=mode;
        }
        else if(op=="open"){++uiOpen;make_preview(req,true);}
        else if(op=="metadata"){
            auto task=req.value("task",std::string{});if(task!="search"&&task!="artist_lookup"&&task!="artist_confirm"&&task!="artist_auto"&&task!="covers")throw std::runtime_error("未知信息任务");
            metadataState[task]={{"pending",true},{"id",req.value("id",std::string{})}};metadata->enqueue(req);
        }
        else if(op=="preview")make_preview(req,false);
        else if(op=="apply"){
            if(!preview||previewDirty||previewWork.valid()||preview->token.empty()||req.value("token",std::string{})!=preview->token){if(!preview)make_preview(req,true);response={{"ok",false},{"code","stale_preview"},{"message","预览已更新，请等待刷新后再次应用"}};changed=true;return;}
            if(preview->revision!=revision||preview->source!=source){auto p=preview->point;make_preview({{"x",p.x},{"y",p.y}},false);response={{"ok",false},{"code","stale_preview"},{"message","播放状态已变化，预览已刷新，请再次应用"}};return;}
            round().preference=preview->point;round().remaining=preview->order;preview.reset();previewDirty=false;set_mode(true);
        }
        else if(op=="cancel"){preview.reset();previewDirty=false;autoApply=false;}
        else if(op=="preset"){make_preview(req,true);autoApply=true;}
        else if(op=="personal_config"){
            if(edition!="full")throw std::runtime_error("此功能仅适用于完整版");
            native_ss::set_personal_library_enabled(req.at("enabled").get<bool>());
        }
        else if(op=="personal_list"){
            if(!personalReady)throw std::runtime_error(personalError);
            response["personal"]=personal.page(req.at("kind").get<std::string>(),req.value("offset",size_t(0)),req.value("limit",size_t(50)));
        }
        else if(op=="personal_flags"){
            if(!personalReady)throw std::runtime_error(personalError);
            response["personal_flags"]=personal.flags(req.at("tracks").get<std::vector<std::string>>());
        }
        else if(op=="personal_set"){
            if(!personalHistory)throw std::runtime_error("请先在插件设置中启用播放历史、收藏和稍后听");
            if(!personalReady)throw std::runtime_error(personalError);
            auto kind=req.at("kind").get<std::string>();auto list=selected_handles(req);
            if(list.get_count()>1024)throw std::runtime_error("每次最多操作1024首歌曲");
            std::vector<json> rows;for(auto& h:list)rows.push_back(personal_track(h));
            bool value;if(req.contains("value")){value=req.at("value").get<bool>();}
            else{if(rows.size()!=1)throw std::runtime_error("批量操作需要明确添加或移除");value=!personal.contains(kind,rows.front().at("id").get<std::string>());}
            if(personal.set(kind,rows,value,epoch())){personalDirty=true;changed=true;}
        }
        else if(op=="scan_retry"){for(auto it=cache.begin();it!=cache.end();){if(!it.value().contains("features"))it=cache.erase(it);else ++it;}lastScan=Clock::now()-std::chrono::seconds(30);writejson(root/L"features.json",cache);changed=true;}
        else if(op=="restart"){if(source.empty())select_source(playlist_manager::get()->get_active_playlist());if(!source.empty()){next_round();if(!nowId.empty())ss::consume(round(),nowId);invalidate();rebuild();}}
        else if(op=="enable"){enabled=req.value("enabled",true);if(enabled){if(source.empty())select_source(playlist_manager::get()->get_active_playlist());rebuild();}else remove_owned_queue();invalidate();}
        else if(op=="playback_mode")set_mode(req.value("mode",std::string("smart"))=="smart",req.value("order",size_t(0)));
        else if(op=="scan_pause"){scanPaused=req.value("paused",!scanPaused);scanner->pause(scanPaused);save();}
        else if(op=="playlist_reorder"){
            auto pm=playlist_manager_v5::get();auto expected=req.at("expected").get<std::vector<std::string>>();
            if(expected.size()!=pm->get_playlist_count())throw std::runtime_error("歌单列表已变化");
            for(size_t i=0;i<expected.size();++i)if(expected[i]!=guidstr(pm->playlist_get_guid(i)))throw std::runtime_error("歌单列表已变化");
            auto order=checked_order(req.at("order"),expected.size());if(!pm->reorder(order.data(),order.size()))throw std::runtime_error("歌单排序未被接受");
        }
        else if(op=="track_reorder"){
            auto pi=edit_playlist(req);auto pm=playlist_manager::get();if(!playlist_reorderable(pi))throw std::runtime_error("此歌单已锁定歌曲顺序");
            metadb_handle_list list;pm->playlist_get_all_items(pi,list);auto expected=req.at("expected").get<std::vector<std::string>>();
            if(expected.size()!=list.get_count())throw std::runtime_error("歌曲列表已变化");for(size_t i=0;i<expected.size();++i)if(expected[i]!=idof(list[i]))throw std::runtime_error("歌曲列表已变化");
            auto order=checked_order(req.at("order"),list.get_count());pm->playlist_undo_backup(pi);if(!pm->playlist_reorder_items(pi,order.data(),order.size()))throw std::runtime_error("歌曲排序未被接受");
        }
        else if(op=="tracks_transfer"){
            auto pm=playlist_manager::get();auto list=selected_handles(req);bool move=req.value("move",false);size_t from=~size_t(0);
            if(move){from=edit_playlist(req);if(!playlist_writable(from))throw std::runtime_error("智能或锁定歌单只能复制歌曲");}
            bool create=req.value("new_playlist",false);size_t target;
            if(create){auto name=req.value("name",std::string("所选歌曲"));if(name.empty()||name==Managed||name=="__verdant_np__"||name==Library)throw std::runtime_error("歌单名称无效");target=pm->create_playlist(name.c_str(),name.size(),pm->get_playlist_count());}
            else target=edit_playlist(req,"target_guid");
            if(target==from)throw std::runtime_error("来源和目标歌单相同");if(!playlist_writable(target))throw std::runtime_error("目标歌单不接受添加歌曲");
            auto beforeCount=pm->playlist_get_item_count(target);pm->playlist_undo_backup(target);pm->playlist_insert_items(target,beforeCount,list,pfc::bit_array_false());
            if(pm->playlist_get_item_count(target)!=beforeCount+list.get_count()){pm->playlist_undo_restore(target);if(create)pm->remove_playlist(target);throw std::runtime_error("添加歌曲失败，已还原目标歌单");}
            if(move){pfc::bit_array_bittable mask(pm->playlist_get_item_count(from));for(auto i:req.at("items").get<std::vector<size_t>>())mask.set(i,true);pm->playlist_undo_backup(from);if(!pm->playlist_remove_items(from,mask)){pm->playlist_undo_restore(target);if(create)pm->remove_playlist(target);throw std::runtime_error("来源歌单拒绝移除，已还原目标歌单");}}
            response["target_playlist"]=target;response["count"]=list.get_count();
        }
        else if(op=="tracks_remove"){
            auto list=selected_handles(req);auto pi=edit_playlist(req);auto pm=playlist_manager::get();if(!playlist_writable(pi))throw std::runtime_error("智能或锁定歌单不能手动移除歌曲");
            pfc::bit_array_bittable mask(pm->playlist_get_item_count(pi));for(auto i:req.at("items").get<std::vector<size_t>>())mask.set(i,true);pm->playlist_undo_backup(pi);
            if(!pm->playlist_remove_items(pi,mask))throw std::runtime_error("歌单拒绝移除歌曲");response["count"]=list.get_count();
        }
        else if(op=="queue_add"){
            auto list=selected_handles(req);auto pm=playlist_manager::get();bool play=req.value("play",false);pendingSeek.reset();remove_owned_queue();
            pfc::list_t<t_playback_queue_item> old;if(play){pm->queue_get_contents(old);pm->queue_flush();}
            for(auto& h:list)pm->queue_add_item(h);
            if(play){for(auto& q:old)pm->queue_add_item(q.m_handle);playback_control::get()->next();}
        }
        else if(op=="queue_reorder"){
            auto scope=req.at("scope").get<std::string>();auto expected=req.at("expected").get<std::vector<std::string>>();auto order=checked_order(req.at("order"),expected.size());
            if(scope=="remaining"){
                if(!enabled||source.empty()||req.at("source").get<std::string>()!=source||expected!=round().remaining)throw std::runtime_error("待播队列已变化");
                auto old=round().remaining;for(size_t i=0;i<order.size();++i)round().remaining[i]=old[order[i]];invalidate();rebuild();
            }else if(scope=="priority"){
                auto pm=playlist_manager::get();pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);std::vector<t_playback_queue_item> user;bool bridge=false;
                for(auto& v:q)if(!owned_queue(v,bridge))user.push_back(v);if(user.size()!=expected.size())throw std::runtime_error("优先队列已变化");
                for(size_t i=0;i<expected.size();++i)if(idof(user[i].m_handle)!=expected[i])throw std::runtime_error("优先队列已变化");
                remove_owned_queue();pm->queue_flush();for(auto i:order){auto& v=user[i];if(v.m_playlist<pm->get_playlist_count()&&v.m_item<pm->playlist_get_item_count(v.m_playlist))pm->queue_add_item_playlist(v.m_playlist,v.m_item);else pm->queue_add_item(v.m_handle);}
            }else throw std::runtime_error("未知待播队列");
        }
        else if(op=="play_playlist"){
            auto pm=playlist_manager_v5::get();
            size_t pi=req.contains("playlist_guid")?edit_playlist(req):req.at("playlist").get<size_t>();
            if(pi>=pm->get_playlist_count()||internal(pi))throw std::runtime_error("歌单已变化，请重新选择");
            pfc::string8 name;pm->playlist_get_name(pi,name);if(name=="__verdant_np__"||name==Library)throw std::runtime_error("内部歌单不能播放");
            if(!pm->playlist_get_item_count(pi))throw std::runtime_error("歌单中没有可播放的歌曲");
            play_source_playlist(pi);
        }
        else if(op=="play_library"){
            // The SDK library is the same collection shown by All Songs, not a union of playlists.
            metadb_handle_list library,all;library_manager::get()->get_all_items(library);
            std::set<std::string> identities;
            for(auto& handle:library)if(identities.insert(idof(handle)).second)all.add_item(handle);
            if(!all.get_count())throw std::runtime_error("音乐库中没有可播放的歌曲");
            auto pm=playlist_manager_v5::get();auto pc=playback_control::get();
            auto pi=pm->find_playlist(Library);bool unchanged=false;
            if(pi<pm->get_playlist_count()){
                metadb_handle_list previous;pm->playlist_get_all_items(pi,previous);std::set<std::string> previousIds;
                for(auto& handle:previous)previousIds.insert(idof(handle));
                // SDK enumeration order is unspecified; preserve a source with unchanged membership.
                unchanged=previous.get_count()==all.get_count()&&previousIds==identities;
                if(unchanged&&source==guidstr(pm->playlist_get_guid(pi))&&pc->is_playing()){
                    if(pc->is_paused())pc->pause(false);changed=true;return;
                }
            }
            if(!unchanged){
                pfc::vartoggle_t<bool> guard(inside,true);
                if(pi>=pm->get_playlist_count())pi=pm->find_or_create_playlist(Library);
                pm->playlist_clear(pi);pm->playlist_insert_items(pi,0,all,pfc::bit_array_false());
            }
            // Repeat clicks were handled above. A changed collection must refresh/reconcile first.
            play_source_playlist(pi,false);
        }
        else if(op=="play"){
            pendingSeek.reset();std::optional<double> seek;
            if(req.contains("seek_seconds")){seek=req.at("seek_seconds").get<double>();if(!std::isfinite(*seek)||*seek<0)throw std::runtime_error("歌词时间无效");}
            size_t pi=req.at("playlist").get<size_t>(),item=req.value("item",size_t(0));auto pm=playlist_manager::get();if(pi>=pm->get_playlist_count()||item>=pm->playlist_get_item_count(pi)||internal(pi))throw std::runtime_error("歌单或歌曲已变化");
            metadb_handle_ptr h;pm->playlist_get_item_handle(h,pi,item);
            if(seek)pendingSeek=SeekTarget{idof(h),*seek,Clock::now()+std::chrono::seconds(15)};
            select_source(pi);
            if(!enabled){remove_owned_queue();invalidate();pm->playlist_execute_default_action(pi,item);return;}
            auto owned=pm->find_or_create_playlist(Managed);remove_owned_queue();pm->playlist_clear(owned);metadb_handle_list all;all.add_item(h);
            for(auto& id:round().remaining)if(id!=idof(h)&&handles.count(id))all.add_item(handles[id]);pm->playlist_insert_items(owned,0,all,pfc::bit_array_false());
            pm->playback_order_set_active(0);invalidate();managedRequested=true;pm->playlist_execute_default_action(owned,0);
        }
        else if(op=="play_match"){
            auto id=req.at("track_id").get<std::string>();auto sequence=req.at("tracks").get<std::vector<std::string>>();
            auto selected=std::find(sequence.begin(),sequence.end(),id);if(selected==sequence.end())throw std::runtime_error("搜索结果已变化");
            std::optional<double> seek;if(req.contains("seconds")){seek=req.at("seconds").get<double>();if(!std::isfinite(*seek)||*seek<0)throw std::runtime_error("歌词时间无效");}
            metadb_handle_ptr current;auto pc=playback_control::get();
            if(seek&&pc->is_playing()&&pc->get_now_playing(current)&&idof(current)==id){
                pendingSeek=SeekTarget{id,*seek,Clock::now()+std::chrono::seconds(15)};return;
            }
            metadb_handle_list list;
            for(auto& identity:sequence){auto cut=identity.rfind('|');if(cut==std::string::npos)throw std::runtime_error("搜索歌曲标识无效");metadb_handle_ptr handle;metadb::get()->handle_create(handle,make_playable_location(identity.substr(0,cut).c_str(),std::stoul(identity.substr(cut+1))));list.add_item(handle);}
            auto pm=playlist_manager::get();auto pi=pm->find_or_create_playlist("__verdant_np__");pm->playlist_clear(pi);pm->playlist_insert_items(pi,0,list,pfc::bit_array_false());
            json play={{"version",1},{"op","play"},{"playlist",pi},{"item",size_t(selected-sequence.begin())}};if(seek)play["seek_seconds"]=*seek;dispatch(play);
        }
        else if(op=="play_id"){
            auto id=req.at("track_id").get<std::string>();auto pm=playlist_manager::get();
            auto pi=index_of_source();if(pi==~size_t(0))throw std::runtime_error("来源歌单已不存在");
            metadb_handle_list list;pm->playlist_get_all_items(pi,list);size_t at=0;for(;at<list.get_count();++at)if(idof(list[at])==id)break;
            if(at==list.get_count())throw std::runtime_error("歌曲已从歌单移除");
            dispatch({{"version",1},{"op","play"},{"playlist",pi},{"item",at}});
        }
        else if(op=="next"){pendingSeek.reset();playback_control::get()->next();}
        else if(op=="previous"){pendingSeek.reset();playback_control::get()->previous();}
        else if(op=="lyrics_panel"){response["lyrics_panel"]=lyrics->update(req);}
        else if(op=="reset_layout")native_ss::request_layout_reset();
        else if(op=="native_preferences")native_ss::open_native_preference();
        else if(op=="update_check"){updater->check();}
        else if(op=="update_config")updater->automatic(req.at("automatic").get<bool>());
        else if(op=="update_open"){updater->check();native_ss::open_updates();}
        else if(op=="update_install")updater->begin_update();
        else if(op=="update_download"){
            auto s=updater->status();if(!s.value("available",false))throw std::runtime_error("没有可下载的更新");
            auto url=wide(s["release"].at("url").get<std::string>());if(reinterpret_cast<INT_PTR>(ShellExecuteW(core_api::get_main_window(),L"open",url.c_str(),nullptr,nullptr,SW_SHOWNORMAL))<=32)throw std::runtime_error("无法打开更新下载链接");
        }
        else if(op=="settings")native_ss::open_settings();
        else if(op=="localization"){response["localization"]=localLabels?localLabels->status():json{{"entries",0},{"hook",false}};if(req.contains("text"))response["text"]=localLabels?narrow(localLabels->translate(wide(req.at("text").get<std::string>()))):req.at("text").get<std::string>();}
        else if(op=="recycle_prepare"){
            auto id=req.at("track_id").get<std::string>();auto cut=id.rfind('|');if(cut==std::string::npos)throw std::runtime_error("歌曲标识无效");
            auto uri=id.substr(0,cut);auto subsong=std::stoul(id.substr(cut+1));
            auto info=recycle.prepare(uri,local_path(uri.c_str()),subsong!=0);metadb_handle_ptr current;
            info["playing"]=playback_control::get()->get_now_playing(current)&&uri==current->get_path();response["recycle"]=info;
        }
        else if(op=="recycle_cancel")recycle.cancel();
        else if(op=="recycle_apply"){
            auto token=req.at("token").get<std::string>();auto uri=recycle.validate(token);metadb_handle_ptr current;
            if(playback_control::get()->get_now_playing(current)&&uri==current->get_path())playback_control::get()->stop();
            recycle.apply(token);
            auto pm=playlist_manager::get();pfc::list_t<t_playback_queue_item> queue;pm->queue_get_contents(queue);pfc::bit_array_bittable remove(queue.get_count());
            for(size_t i=0;i<queue.get_count();++i)if(uri==queue[i].m_handle->get_path())remove.set(i,true);
            pm->queue_remove_mask(remove);pfc::list_t<const char*> paths;paths.add_item(uri.c_str());file_operation_callback::g_on_files_deleted(paths);
            if(index_of_source()!=~size_t(0))refresh();invalidate();rebuild();response["recycled"]=true;
        }
        else if(op=="menu_open"){
            lyrics->update({{"visible",false}});
            if(req.value("kind",std::string{})=="main")response["menu"]=nativeMenus.open_main(req.at("root").get<std::string>());
            else{
                if(req.contains("tracks")){response["menu"]=nativeMenus.open_context(selected_handles(req));changed=true;return;}
                metadb_handle_list selected;metadb_handle_ptr h;
                if(req.contains("playlist")){
                    auto p=req.at("playlist").get<size_t>(),i=req.at("item").get<size_t>();auto pm=playlist_manager::get();
                    if(p>=pm->get_playlist_count()||i>=pm->playlist_get_item_count(p))throw std::runtime_error("歌曲已从歌单移除");
                    pm->playlist_get_item_handle(h,p,i);
                }else{
                    auto id=req.at("track_id").get<std::string>();auto cut=id.rfind('|');if(cut==std::string::npos)throw std::runtime_error("歌曲标识无效");
                    metadb::get()->handle_create(h,make_playable_location(id.substr(0,cut).c_str(),std::stoul(id.substr(cut+1))));
                }
                selected.add_item(h);response["menu"]=nativeMenus.open_context(selected);
            }
        }
        else if(op=="menu_execute")nativeMenus.execute(req.at("token").get<std::string>(),req.at("command").get<unsigned>());
        else if(op=="artist_resource"){
            auto name=req.at("name").get<std::string>(),kind=req.at("resource").get<std::string>();auto artists=readjson(root/L"artists.json");
            if(!artists.contains(name)||!artists[name].value("verified",false))throw std::runtime_error("歌手资料尚未确认");
            auto record=artists[name];bool file=kind=="portrait"||kind=="metadata";std::string target;
            if(file){
                fs::path path=kind=="metadata"?root/L"artists.json":fs::path(wide(record.value("portrait",std::string{})));
                if(path.empty()||!fs::is_regular_file(path))throw std::runtime_error("本地图片或资料文件不存在");
                auto base=fs::weakly_canonical(kind=="metadata"?root:root/L"artist-portraits"),resolved=fs::weakly_canonical(path);
                auto relative=resolved.lexically_relative(base);if(relative.empty()||relative.is_absolute()||std::any_of(relative.begin(),relative.end(),[](const fs::path& part){return part==L"..";}))throw std::runtime_error("资料路径不在本地缓存中");
                target=narrow(resolved.wstring());
                if(req.value("open",true)){PIDLIST_ABSOLUTE pidl=nullptr;auto hr=SHParseDisplayName(resolved.c_str(),nullptr,&pidl,0,nullptr);if(SUCCEEDED(hr)){hr=SHOpenFolderAndSelectItems(pidl,0,nullptr,0);CoTaskMemFree(pidl);}if(FAILED(hr))throw std::runtime_error("无法在资源管理器中定位文件");}
            }else{
                target=record.value(kind=="source"?"source":kind=="picture_source"?"portrait_source":"",std::string{});
                bool allowed=false;for(auto prefix:{"https://musicbrainz.org/artist/","https://www.wikidata.org/wiki/","https://commons.wikimedia.org/wiki/","https://open.spotify.com/artist/"})if(target.rfind(prefix,0)==0)allowed=true;
                if(!allowed)throw std::runtime_error("来源地址不可用");
                if(req.value("open",true)&&reinterpret_cast<INT_PTR>(ShellExecuteW(core_api::get_main_window(),L"open",wide(target).c_str(),nullptr,nullptr,SW_SHOWNORMAL))<=32)throw std::runtime_error("无法打开资料来源页面");
            }
            response["resource"]={{"kind",kind},{"target",target},{"file",file}};
        }
        else if(op=="appearance"){
            auto config=ui_config_manager::get();response["dark_mode"]=config->is_dark_mode();response["fonts"]=json::object();
            const std::pair<const char*,GUID> fonts[]={{"default",ui_font_default},{"lists",ui_font_lists},{"playlists",ui_font_playlists},{"tabs",ui_font_tabs},{"statusbar",ui_font_statusbar},{"console",ui_font_console}};
            for(auto& [name,guid]:fonts){LOGFONTW font{};if(GetObjectW(config->query_font(guid),sizeof(font),&font))response["fonts"][name]={{"family",narrow(font.lfFaceName)},{"height",font.lfHeight},{"weight",font.lfWeight}};}
        }
        else if(op=="artist_catalog"){
            metadb_handle_list all;library_manager::get()->get_all_items(all);auto pm=playlist_manager::get();
            for(size_t i=0;i<pm->get_playlist_count();++i)if(!internal(i)){metadb_handle_list list;pm->playlist_get_all_items(i,list);all.add_items(list);}
            std::set<std::string> seen;std::map<std::string,json> artists;titleformat_object::ptr script;titleformat_compiler::get()->compile_safe(script,"[%album artist%]");
            for(auto& handle:all){
                if(!seen.insert(idof(handle)).second)continue;pfc::string8 value;handle->format_title(nullptr,value,script,nullptr);auto name=std::string(value.c_str());if(name.empty()||name=="?")continue;
                auto& artist=artists[name];if(artist.is_null())artist={{"name",name},{"albums",json::array()},{"mbids",json::array()},{"tracks",0}};
                artist["tracks"]=artist["tracks"].get<size_t>()+1;file_info_impl info;if(!handle->get_info(info))continue;
                if(auto album=info.meta_get("ALBUM",0)){auto& albums=artist["albums"];if(std::find(albums.begin(),albums.end(),album)==albums.end())albums.push_back(album);}
                for(size_t j=0;j<info.meta_get_count_by_name("MUSICBRAINZ_ARTISTID");++j){auto id=info.meta_get("MUSICBRAINZ_ARTISTID",j);auto& ids=artist["mbids"];if(id&&std::find(ids.begin(),ids.end(),id)==ids.end())ids.push_back(id);}
            }
            response["artists"]=json::array();for(auto& [name,artist]:artists)response["artists"].push_back(artist);
            response["track_count"]=seen.size();
        }
        else if(op=="diagnostics"){
            response["console"]=json::array();auto lines=fb2k::console_manager::get()->getLines();
            for(size_t i=lines->size()>120?lines->size()-120:0;i<lines->size();++i){fb2k::string::ptr line;if(line &= lines->itemAt(i))response["console"].push_back(line->c_str());}
        }
        else if(op=="outputs"){
            auto manager=output_manager_v2::get();auto config=manager->getCoreConfig();json devices=json::array();
            manager->listDevices([&](const char* name,const GUID& out,const GUID& dev){devices.push_back({{"name",name},{"output_id",guidstr(out)},{"device_id",guidstr(dev)},{"active",out==config.m_output&&dev==config.m_device}});});
            response["devices"]=devices;response["active_output"]=guidstr(config.m_output);response["active_device"]=guidstr(config.m_device);
            response["components"]=json::array();service_enum_t<componentversion> versions;componentversion::ptr version;
            while(versions.next(version)){pfc::string8 name,v,file;version->get_component_name(name);version->get_component_version(v);version->get_file_name(file);response["components"].push_back({{"name",name.c_str()},{"version",v.c_str()},{"file",file.c_str()}});}
        }
        else if(op=="set_output"){
            auto out=parseguid(req.at("output_id").get<std::string>()),dev=parseguid(req.at("device_id").get<std::string>());bool found=false;auto manager=output_manager_v2::get();
            manager->listDevices([&](const char*,const GUID& o,const GUID& d){if(out==o&&dev==d)found=true;});
            if(!found)throw std::runtime_error("该音频输出设备已不可用，请刷新列表");manager->setCoreConfigDevice(out,dev);
        }
        else if(op=="state"){}
        else throw std::runtime_error("未知的随机偏好操作");
        changed=true;
    }
    void queue_scans(){
        if(!fs::exists(root/L"runtime"/L"smartshuffle-analyzer"/L"smartshuffle-analyzer.exe"))return;
        auto enqueue=[&](metadb_handle_ptr h,bool priority){auto fp=fingerprint(h);if(!fp.empty()&&(!cache.contains(fp)||(!cache[fp].contains("features")&&cache[fp].value("retry_after",int64_t(0))<=epoch())))scanner->enqueue({idof(h),fp,h},priority);};
        for(auto it=tracks.rbegin();it!=tracks.rend();++it)enqueue(handles[it->id],true);metadb_handle_list library;library_manager::get()->get_all_items(library);for(auto& h:library)enqueue(h,false);
    }
    void tick(){
        if(updater->poll()){changed=true;auto u=updater->status();if(!updateNotified&&u.value("automatic",true)&&u.value("available",false)){updateNotified=true;native_ss::open_updates();}}
        for(auto& result:metadata->results()){auto task=result.value("task",std::string{});if(metadataState[task].value("id",std::string{})==result.value("id",std::string{})){metadataState[task]=std::move(result);changed=true;}}
        if(quitting||inside)return;
        auto now=Clock::now();accrue();
        auto pc=playback_control::get();auto pm=playlist_manager::get();
        if(pendingMode){auto mode=*pendingMode;pendingMode.reset();set_mode(false,mode);}
        while(!events.empty()){auto e=events.front();events.pop_front();process_new(std::move(e));}
        if(pendingSeek){
            if(now>pendingSeek->expires)pendingSeek.reset();
            else if(pc->is_playing()&&pc->playback_can_seek()){
                metadb_handle_ptr current;if(pc->get_now_playing(current)&&idof(current)==pendingSeek->id){
                    auto seconds=pendingSeek->seconds,length=pc->playback_get_length();pendingSeek.reset();
                    if(length>0)seconds=std::min(seconds,std::max(0.0,length-.05));
                    pc->playback_seek(seconds);if(pc->is_paused())pc->pause(false);changed=true;
                }
            }
        }
        // on_new_track can precede a decoder failure. Preparing another round
        // requires real elapsed playback, so an entirely bad round cannot loop.
        if(enabled&&!source.empty()&&round().remaining.empty()&&!tracks.empty()&&pc->is_playing()&&roundAudio[source]){next_round();invalidate();rebuild();}
        if(dirty){dirty=false;if(index_of_source()==~size_t(0)){source.clear();tracks.clear();handles.clear();enabled=false;remove_owned_queue();}else{refresh();rebuild();}invalidate();}

        auto done=scanner->results();if(!done.empty()){
            for(auto& r:done){if(r.error.empty())cache[r.fingerprint]={{"features",r.features}};else cache[r.fingerprint]={{"error",r.error},{"retry_after",epoch()+3600}};for(auto& t:tracks)if(t.id==r.id&&r.error.empty())t.features=r.features;}
            ++scanRevision;writejson(root/L"features.json",cache);changed=true;
        }
        if(now-lastScan>std::chrono::seconds(10)){queue_scans();lastScan=now;changed=true;}
        // Native queue is reserved for the user's inserts; our bridge entry is removed
        // whenever a user entry appears, preserving that user's queue priority.
        pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);externalQueue.clear();bool own=false,bridgeUsed=false;
        for(auto& item:q){if(owned_queue(item,bridgeUsed))own=true;else externalQueue.insert(idof(item.m_handle));}
        if(own&&!externalQueue.empty())remove_owned_queue();
        if(enabled&&pc->is_playing()&&q.get_count()==0&&!source.empty()){
            size_t p=~size_t(0),i=~size_t(0);pm->get_playing_item_location(&p,&i);if(!internal(p)&&!round().remaining.empty())rebuild();
        }
        if(ended){ended=false;if(enabled&&!pc->is_playing()&&!pc->get_stop_after_current()&&!source.empty()){
            // Only account the exact managed tail whose EOF was observed. A later
            // successful start, playlist edit, or new round invalidates this snapshot.
            if(eofManaged&&eofSource==source&&eofRevision==revision&&eofRound==round().number&&eofRemaining==round().remaining&&!eofRemaining.empty()){
                for(auto& id:eofRemaining)ss::consume(round(),id);
                invalidate();error="本轮剩余歌曲无法播放，已标记为失败并停止；可重新开始一轮重试";
            }else if(!round().remaining.empty()){error="播放已结束，剩余进度已保留；可点选下一首或重新开始一轮重试";changed=true;}
            if(round().remaining.empty()&&roundAudio[source]&&!tracks.empty()){
                next_round();invalidate();rebuild(false);managedRequested=true;
                pm->playlist_execute_default_action(pm->find_or_create_playlist(Managed),0);
            }
        }}
        try{auto req=readjson(root/L"request.json");if(req.is_object()&&req.contains("id")&&req["id"].is_string()){auto id=req["id"].get<std::string>();if(id!=lastRequest){lastRequest=id;try{dispatch(req);}catch(const std::exception& e){error=e.what();response={{"ok",false},{"message",error}};}changed=true;}}}catch(...){/* A concurrent request write is retried on the next tick. */}
        pump_clients();pump_preview();
        cleanup_temporary_playlists();save_personal();
        if(changed||now-lastPublish>std::chrono::seconds(2))publish();
    }
};
std::unique_ptr<Engine> engine;
UINT_PTR timer=0;
class QueueObserver:public playback_queue_callback {void on_changed(t_change_origin origin)override{if(engine)try{engine->queue_changed(origin);}catch(...){}};};
service_factory_single_t<QueueObserver> queueObserver;
void CALLBACK tick_proc(HWND,UINT,UINT_PTR,DWORD){try{if(engine)engine->tick();}catch(const std::exception& e){console::print((std::string("Smart Shuffle: ")+e.what()).c_str());}catch(...){console::print("Smart Shuffle: callback failed");}}
class Lifecycle:public initquit {
    void on_init()override{fb2k::inMainThread([]{try{
        if(native_ss::integration_original()){
            auto root=local_path(core_api::get_profile_path())/L"smartshuffle";
            writejson(root/L"state.json",{{"version",1},{"pid",GetCurrentProcessId()},{"component",SS_VERSION},{"integration_mode","original"},{"enabled",false},{"edition","full"},{"fonts",{{"private_resources",privateFontCount}}}});
            console::print("Smart Shuffle: original interface mode; integration inactive");return;
        }
        engine=std::make_unique<Engine>();timer=SetTimer(nullptr,0,40,tick_proc);console::print("Smart Shuffle " SS_VERSION " loaded (bridge v1)");
    }catch(const std::exception& e){console::print((std::string("Smart Shuffle init: ")+e.what()).c_str());}});}
    void on_quit()override{if(timer){KillTimer(nullptr,timer);timer=0;}engine.reset();}
};
initquit_factory_t<Lifecycle> lifecycle;
const GUID menuGroup={0xe8b61f29,0x598c,0x4a63,{0xa5,0x4c,0xab,0x9f,0x60,0x28,0x82,0xea}};
mainmenu_group_popup_factory group(menuGroup,mainmenu_groups::playback,mainmenu_commands::sort_priority_base,"随机偏好");
class Menu:public mainmenu_commands {
    t_uint32 get_command_count()override{return 8;}
    GUID get_command(t_uint32 i)override{GUID g={0x35f6ca00+i,0x949e,0x4405,{0xbc,0x90,0xc3,0x88,0x46,0x31,0xd2,0xa9}};return g;}
    void get_name(t_uint32 i,pfc::string_base& out)override{if(i==7){out=native_ss::integration_original()?"一键启用新版界面（重启）":"一键停用改动，切换原版（重启）";return;}const char* names[]={"调整随机偏好","智能均衡随机","常听优先","重新开始一轮","暂停或继续音频分析","启用或关闭智能调度","检查更新…"};out=names[i];}
    bool get_display(t_uint32 i,pfc::string_base& text,t_uint32& flags)override{get_name(i,text);flags=(i==7?!native_ss::integration_available():!engine)?flag_disabled:0;return true;}
    bool get_description(t_uint32,pfc::string_base& out)override{out="每轮全覆盖，根据听歌频率和音频风格调整出场顺序";return true;}
    GUID get_parent()override{return menuGroup;}
    void execute(t_uint32 i,ctx_t)override{try{if(i==7){native_ss::integration_switch();return;}if(!engine)return;if(i==0){if(engine->themeVersion.empty())native_ss::open_native_preference();else engine->dispatch({{"version",1},{"op","open"}});}else if(i==1||i==2){engine->dispatch({{"version",1},{"op","preset"},{"x",i==1?0:.75},{"y",0}});}else if(i==3)engine->dispatch({{"version",1},{"op","restart"}});else if(i==4)engine->dispatch({{"version",1},{"op","scan_pause"}});else if(i==5)engine->dispatch({{"version",1},{"op","enable"},{"enabled",!engine->enabled}});else{engine->updater->check();native_ss::open_updates();}engine->publish();}catch(const std::exception& e){popup_message::g_show(e.what(),"随机偏好");}}
};
mainmenu_commands_factory_t<Menu> menus;
}
