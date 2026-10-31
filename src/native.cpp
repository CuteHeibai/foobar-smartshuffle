#include <foobar2000/SDK/foobar2000.h>
#include "core.hpp"
#include "scanner.hpp"
#include "lyrics_host.hpp"
#include <fstream>
#include <map>
#include <set>
#include <deque>
#include <chrono>
#include <random>
#include <filesystem>
#include <optional>
#include <future>

DECLARE_COMPONENT_VERSION("Smart Shuffle · 二维随机偏好","1.0.0","本地随机偏好：每轮全覆盖，听歌频率与音频风格二维调节。\n源码随本机安装包提供。")
VALIDATE_COMPONENT_FILENAME("foo_smartshuffle.dll")

namespace {
using json=nlohmann::json;
namespace fs=std::filesystem;
using Clock=std::chrono::steady_clock;
constexpr auto Managed="__smartshuffle__";
std::wstring wide(const std::string& s){if(s.empty())return {};int n=MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),nullptr,0);std::wstring r(n,0);MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),r.data(),n);return r;}
std::string narrow(const std::wstring& s){if(s.empty())return {};int n=WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),nullptr,0,nullptr,nullptr);std::string r(n,0);WideCharToMultiByte(CP_UTF8,0,s.data(),int(s.size()),r.data(),n,nullptr,nullptr);return r;}
fs::path local_path(const char* s){
    wchar_t exe[MAX_PATH*4]{};GetModuleFileNameW(nullptr,exe,MAX_PATH*4);const auto base=fs::path(exe).parent_path();
    std::string text=s;if(text.rfind("file-relative://",0)==0)return (base/fs::path(wide(text.substr(16)))).lexically_normal();
    pfc::string8 out;fs::path path;if(filesystem::g_get_native_path(s,out))path=fs::path(wide(out.c_str()));else path=fs::path(wide(s));
    return path.is_relative()?(base/path).lexically_normal():path;
}
std::string idof(const metadb_handle_ptr& h){return std::string(h->get_path())+"|"+std::to_string(h->get_subsong_index());}
std::string guidstr(GUID g){wchar_t b[40]{};StringFromGUID2(g,b,40);return narrow(b);}
GUID parseguid(const std::string& s){GUID g{};CLSIDFromString(wide(s).c_str(),&g);return g;}
bool created_during_this_process(const fs::path& p){FILETIME created,exited,kernel,user;WIN32_FILE_ATTRIBUTE_DATA data{};return GetProcessTimes(GetCurrentProcess(),&created,&exited,&kernel,&user)&&GetFileAttributesExW(p.c_str(),GetFileExInfoStandard,&data)&&CompareFileTime(&data.ftLastWriteTime,&created)>=0;}
json readjson(const fs::path& p){std::ifstream f(p,std::ios::binary);if(!f)return json::object();std::string s((std::istreambuf_iterator<char>(f)),{});if(s.rfind("\xEF\xBB\xBF",0)==0)s.erase(0,3);return json::parse(s);}
void writejson(const fs::path& p,const json& j){auto tmp=p;tmp+=L".tmp";{std::ofstream f(tmp,std::ios::binary|std::ios::trunc);auto s=j.dump(-1,' ',false,json::error_handler_t::replace);f.write(s.data(),s.size());if(!f)throw std::runtime_error("无法写入随机偏好状态");}if(!MoveFileExW(tmp.c_str(),p.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("无法提交随机偏好状态");}
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
    bool enabled=true,scanPaused=false,changed=true,dirty=false,quitting=false,inside=false;
    uint64_t revision=1,uiOpen=0,scanRevision=0;
    std::string source,lastRequest,error,nowId;
    std::map<std::string,ss::Round> rounds;
    std::map<std::string,std::vector<int64_t>> recent;
    json cache=json::object(),response=json::object();
    std::vector<ss::Track> tracks;
    std::map<std::string,metadb_handle_ptr> handles;
    std::optional<Preview> preview;
    std::future<Preview> previewWork;bool previewDirty=false,autoApply=false;
    play_control::t_track_command startCommand=play_control::track_command_default;
    std::map<std::string,double> lifetime;double countAtStart=0;
    std::map<std::string,bool> roundAudio;
    bool accountingPlaying=false,accountingPaused=false;
    std::unique_ptr<native_ss::Scanner> scanner;
    std::unique_ptr<native_ss::LyricsHost> lyrics;
    std::string themeVersion;
    uint64_t themeWindow=0;
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
    Engine():play_callback_impl_base(flag_on_playback_starting|flag_on_playback_new_track|flag_on_playback_stop|flag_on_playback_seek|flag_on_playback_pause),playlist_callback_impl_base(playlist_callback::flag_on_items_added|playlist_callback::flag_on_items_removed|playlist_callback::flag_on_items_reordered|playlist_callback::flag_on_playlist_renamed|playlist_callback::flag_on_playlists_removed){
        root=local_path(core_api::get_profile_path())/L"smartshuffle";fs::create_directories(root);
        try{auto j=readjson(root/L"store.json");if(j.value("version",1)==1){lifetime=j.value("lifetime",decltype(lifetime){});roundAudio=j.value("round_audio",decltype(roundAudio){});enabled=j.value("enabled",true);source=j.value("source",std::string{});rounds=j.value("rounds",decltype(rounds){});recent=j.value("recent",decltype(recent){});scanPaused=j.value("scanPaused",false);}}catch(const std::exception& e){error=std::string("恢复轮次失败，已保留原文件：")+e.what();}
        try{auto j=readjson(root/L"features.json");if(j.is_object())cache=std::move(j);}catch(...){error="音频特征缓存无法读取，将重新分析";}
        lyrics=std::make_unique<native_ss::LyricsHost>();
        scanner=std::make_unique<native_ss::Scanner>(root);scanner->pause(scanPaused);
        if(index_of_source()==~size_t(0))source.clear();
        if(source.empty())select_source(playlist_manager::get()->get_active_playlist());else refresh();
        if(!fs::exists(root/L"request.json"))lastRequest.clear();else try{auto pending=readjson(root/L"request.json");if(!created_during_this_process(root/L"request.json"))lastRequest=pending.value("id",std::string{});}catch(...){}
        metadb_handle_ptr h;if(playback_control::get()->get_now_playing(h)){on_playback_new_track(h);accountingPaused=playback_control::get()->is_paused();}
        publish();
    }
    ~Engine(){quitting=true;lyrics.reset();scanner.reset();save();}
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
    void select_source(size_t pi){auto pm=playlist_manager_v5::get();if(pi>=pm->get_playlist_count()||internal(pi))return;source=guidstr(pm->playlist_get_guid(pi));refresh();lastScan=Clock::now()-std::chrono::seconds(30);changed=true;}
    std::vector<ss::Track> remaining_tracks(){std::set<std::string> ids(round().remaining.begin(),round().remaining.end());std::vector<ss::Track> ret;for(auto& t:tracks)if(ids.count(t.id))ret.push_back(t);return ret;}
    json track_json(const std::string& id){auto it=std::find_if(tracks.begin(),tracks.end(),[&](const ss::Track& t){return t.id==id;});if(it!=tracks.end())return {{"id",id},{"title",it->title},{"artist",it->artist},{"duration",it->duration},{"analyzed",!it->features.empty()}};return {{"id",id},{"title",id},{"artist",""}};}
    json list_json(const std::vector<std::string>& ids,size_t limit=SIZE_MAX){json a=json::array();for(size_t i=0;i<ids.size()&&i<limit;++i)a.push_back(track_json(ids[i]));return a;}
    void save(){try{writejson(root/L"store.json",{{"version",1},{"enabled",enabled},{"source",source},{"rounds",rounds},{"recent",recent},{"lifetime",lifetime},{"round_audio",roundAudio},{"scanPaused",scanPaused}});}catch(const std::exception& e){error=e.what();}}
    void publish(){
        json j={{"version",1},{"pid",GetCurrentProcessId()},{"component","1.0.0"},{"revision",revision},{"request_id",lastRequest},{"enabled",enabled},{"source",source},{"source_name",source_name()},{"ui_open",uiOpen},{"error",error},{"response",response},{"managed_playlist",Managed}};
        if(!source.empty()){j["point"]=round().preference;j["round"]=round().number;j["remaining_count"]=round().remaining.size();j["remaining"]=list_json(round().remaining);}
        else{j["point"]={{"x",0},{"y",0}};j["round"]=1;j["remaining_count"]=0;j["remaining"]=json::array();}
        j["preview_pending"]=previewDirty||previewWork.valid();j["now_id"]=nowId;j["queue"]=json::array();
        auto pm=playlist_manager::get();pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);
        for(auto& v:q)if(!internal(v.m_playlist))j["queue"].push_back(track_json(idof(v.m_handle)));
        size_t completed=0,failed=0;for(auto& t:tracks){auto fp=fingerprint(handles[t.id]);if(cache.contains(fp)){if(cache[fp].contains("features"))++completed;else ++failed;}}
        j["scan"]={{"paused",scanPaused},{"completed",completed},{"failed",failed},{"total",tracks.size()},{"pending",scanner?scanner->pending():0},{"revision",scanRevision}};
        j["theme"]={{"version",themeVersion},{"window",themeWindow}};
        j["lyrics_panel"]=lyrics?lyrics->status():json::object();
        if(preview)j["preview"]={{"token",preview->token},{"revision",preview->revision},{"point",preview->point},{"tracks",list_json(preview->order,8)},{"total",preview->order.size()}};
        else j["preview"]=nullptr;
        try{writejson(root/L"state.json",j);}catch(const std::exception& e){console::print((std::string("Smart Shuffle: ")+e.what()).c_str());}
        changed=false;lastPublish=Clock::now();
    }
    void invalidate(){++revision;if(preview){preview->revision=revision;preview->source=source;preview->token.clear();previewDirty=true;}autoApply=false;changed=true;save();}
    void remove_owned_queue(){auto pm=playlist_manager::get();pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);pfc::bit_array_bittable mask(q.get_count());bool any=false;for(size_t i=0;i<q.get_count();++i)if(internal(q[i].m_playlist)){mask.set(i,true);any=true;}if(any)pm->queue_remove_mask(mask);}
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
        bool own=false,user=false;
        for(auto& v:q){bool isOwn=internal(v.m_playlist);next.emplace_back(idof(v.m_handle),isOwn);own|=isOwn;user|=!isOwn;}
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
    void on_playback_starting(play_control::t_track_command c,bool paused)override{startCommand=c;accountingPaused=paused;if(managedRequested){managedContext=true;managedRequested=false;}else if(c!=play_control::track_command_default&&c!=play_control::track_command_next)managedContext=false;}
    void on_playback_new_track(metadb_handle_ptr h)override{accrue();nowId=idof(h);listened=0;statsCounted=false;auto t=describe(h);duration=t.duration;countAtStart=t.play_count;clock=Clock::now();queue_event(h);startCommand=play_control::track_command_default;accountingPlaying=true;accountingPaused=playback_control::get()->is_paused();}
    void on_playback_stop(play_control::t_stop_reason r)override{accrue();accountingPlaying=false;if(r==play_control::stop_reason_eof){ended=true;eofManaged=managedContext;eofRevision=revision;eofSource=source;eofRound=source.empty()?0:round().number;eofRemaining=source.empty()?std::vector<std::string>{}:round().remaining;}}
    void on_playback_seek(double)override{accrue();}
    void on_playback_pause(bool p)override{accrue();accountingPaused=p;}
    void on_items_added(t_size p,t_size,const pfc::list_base_const_t<metadb_handle_ptr>&,const bit_array&)override{markdirty(p);}
    void on_items_removed(t_size p,const bit_array&,t_size,t_size)override{markdirty(p);}
    void on_items_reordered(t_size p,const t_size*,t_size)override{markdirty(p);}
    void on_playlist_renamed(t_size p,const char*,t_size)override{markdirty(p);}
    void on_playlists_removed(const bit_array&,t_size,t_size)override{if(!inside)dirty=true;}
    void markdirty(size_t p){if(!inside&&!internal(p))dirty=true;}
    void process_new(NewTrack e){
        nowId=idof(e.handle);
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

    void dispatch(const json& req){
        const auto op=req.value("op",std::string("state"));response={{"ok",true}};error.clear();
        if(req.value("version",0)!=1)throw std::runtime_error("不支持的接口版本");
        if(req.contains("theme_version")){themeVersion=req.at("theme_version").get<std::string>();themeWindow=req.value("theme_window",uint64_t(0));}
        if(op=="open"){++uiOpen;make_preview(req,true);}
        else if(op=="preview")make_preview(req,false);
        else if(op=="apply"){
            if(!preview||previewDirty||previewWork.valid()||preview->token.empty()||req.value("token",std::string{})!=preview->token){if(!preview)make_preview(req,true);response={{"ok",false},{"code","stale_preview"},{"message","预览已更新，请等待刷新后再次应用"}};changed=true;return;}
            if(preview->revision!=revision||preview->source!=source){auto p=preview->point;make_preview({{"x",p.x},{"y",p.y}},false);response={{"ok",false},{"code","stale_preview"},{"message","播放状态已变化，预览已刷新，请再次应用"}};return;}
            round().preference=preview->point;round().remaining=preview->order;enabled=true;preview.reset();previewDirty=false;invalidate();rebuild();
        }
        else if(op=="cancel"){preview.reset();previewDirty=false;autoApply=false;}
        else if(op=="preset"){make_preview(req,true);autoApply=true;}
        else if(op=="scan_retry"){for(auto it=cache.begin();it!=cache.end();){if(!it.value().contains("features"))it=cache.erase(it);else ++it;}lastScan=Clock::now()-std::chrono::seconds(30);writejson(root/L"features.json",cache);changed=true;}
        else if(op=="restart"){if(source.empty())select_source(playlist_manager::get()->get_active_playlist());if(!source.empty()){next_round();if(!nowId.empty())ss::consume(round(),nowId);invalidate();rebuild();}}
        else if(op=="enable"){enabled=req.value("enabled",true);if(enabled){if(source.empty())select_source(playlist_manager::get()->get_active_playlist());rebuild();}else remove_owned_queue();invalidate();}
        else if(op=="scan_pause"){scanPaused=req.value("paused",!scanPaused);scanner->pause(scanPaused);save();}
        else if(op=="play"){
            size_t pi=req.at("playlist").get<size_t>(),item=req.value("item",size_t(0));auto pm=playlist_manager::get();if(pi>=pm->get_playlist_count()||item>=pm->playlist_get_item_count(pi)||internal(pi))throw std::runtime_error("歌单或歌曲已变化");
            select_source(pi);enabled=true;metadb_handle_ptr h;pm->playlist_get_item_handle(h,pi,item);
            auto owned=pm->find_or_create_playlist(Managed);remove_owned_queue();pm->playlist_clear(owned);metadb_handle_list all;all.add_item(h);
            for(auto& id:round().remaining)if(id!=idof(h)&&handles.count(id))all.add_item(handles[id]);pm->playlist_insert_items(owned,0,all,pfc::bit_array_false());
            pm->playback_order_set_active(0);invalidate();managedRequested=true;pm->playlist_execute_default_action(owned,0);
        }
        else if(op=="play_id"){
            auto id=req.at("track_id").get<std::string>();auto pm=playlist_manager::get();
            auto pi=index_of_source();if(pi==~size_t(0))throw std::runtime_error("来源歌单已不存在");
            metadb_handle_list list;pm->playlist_get_all_items(pi,list);size_t at=0;for(;at<list.get_count();++at)if(idof(list[at])==id)break;
            if(at==list.get_count())throw std::runtime_error("歌曲已从歌单移除");
            dispatch({{"version",1},{"op","play"},{"playlist",pi},{"item",at}});
        }
        else if(op=="next")playback_control::get()->next();
        else if(op=="previous")playback_control::get()->previous();
        else if(op=="lyrics_panel"){response["lyrics_panel"]=lyrics->update(req);}
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
        if(quitting||inside)return;
        auto now=Clock::now();accrue();
        auto pc=playback_control::get();auto pm=playlist_manager::get();
        while(!events.empty()){auto e=events.front();events.pop_front();process_new(std::move(e));}
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
        pfc::list_t<t_playback_queue_item> q;pm->queue_get_contents(q);externalQueue.clear();bool own=false;
        for(auto& item:q){if(internal(item.m_playlist))own=true;else externalQueue.insert(idof(item.m_handle));}
        if(enabled&&own&&!externalQueue.empty())remove_owned_queue();
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
        pump_preview();
        if(changed||now-lastPublish>std::chrono::seconds(2))publish();
    }
};
std::unique_ptr<Engine> engine;
UINT_PTR timer=0;
class QueueObserver:public playback_queue_callback {void on_changed(t_change_origin origin)override{if(engine)try{engine->queue_changed(origin);}catch(...){}};};
service_factory_single_t<QueueObserver> queueObserver;
void CALLBACK tick_proc(HWND,UINT,UINT_PTR,DWORD){try{if(engine)engine->tick();}catch(const std::exception& e){console::print((std::string("Smart Shuffle: ")+e.what()).c_str());}catch(...){console::print("Smart Shuffle: callback failed");}}
class Lifecycle:public initquit {
    void on_init()override{fb2k::inMainThread([]{try{engine=std::make_unique<Engine>();timer=SetTimer(nullptr,0,200,tick_proc);console::print("Smart Shuffle 1.0.0 loaded (bridge v1)");}catch(const std::exception& e){console::print((std::string("Smart Shuffle init: ")+e.what()).c_str());}});}
    void on_quit()override{if(timer){KillTimer(nullptr,timer);timer=0;}engine.reset();}
};
initquit_factory_t<Lifecycle> lifecycle;
const GUID menuGroup={0xe8b61f29,0x598c,0x4a63,{0xa5,0x4c,0xab,0x9f,0x60,0x28,0x82,0xea}};
mainmenu_group_popup_factory group(menuGroup,mainmenu_groups::playback,mainmenu_commands::sort_priority_base,"随机偏好");
class Menu:public mainmenu_commands {
    t_uint32 get_command_count()override{return 6;}
    GUID get_command(t_uint32 i)override{GUID g={0x35f6ca00+i,0x949e,0x4405,{0xbc,0x90,0xc3,0x88,0x46,0x31,0xd2,0xa9}};return g;}
    void get_name(t_uint32 i,pfc::string_base& out)override{const char* names[]={"调整随机偏好","智能均衡随机","常听优先","重新开始一轮","暂停或继续音频分析","启用或关闭智能调度"};out=names[i];}
    bool get_description(t_uint32,pfc::string_base& out)override{out="每轮全覆盖，根据听歌频率和音频风格调整出场顺序";return true;}
    GUID get_parent()override{return menuGroup;}
    void execute(t_uint32 i,ctx_t)override{if(!engine)return;try{if(i==0)engine->dispatch({{"version",1},{"op","open"}});else if(i==1||i==2){engine->dispatch({{"version",1},{"op","preset"},{"x",i==1?0:.75},{"y",0}});}else if(i==3)engine->dispatch({{"version",1},{"op","restart"}});else if(i==4)engine->dispatch({{"version",1},{"op","scan_pause"}});else engine->dispatch({{"version",1},{"op","enable"},{"enabled",!engine->enabled}});engine->publish();}catch(const std::exception& e){popup_message::g_show(e.what(),"随机偏好");}}
};
mainmenu_commands_factory_t<Menu> menus;
}
