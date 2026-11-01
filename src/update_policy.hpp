#pragma once
#include "json.hpp"
#include <array>
#include <optional>
#include <string>
#include <sstream>
namespace native_ss {
inline std::string installation_edition(const nlohmann::json& manifest,bool projectTheme){auto edition=manifest.value("edition",projectTheme?std::string("full"):std::string("core"));return edition=="full"?"full":"core";}
inline std::optional<std::array<unsigned long,3>> release_version(std::string value){
    if(value.starts_with('v'))value.erase(0,1);std::array<unsigned long,3> parts{};
    for(int i=0;i<3;++i){auto end=value.find('.');auto part=value.substr(0,end);if(part.empty()||part.size()>8||part.find_first_not_of("0123456789")!=std::string::npos)return {};
        parts[i]=std::stoul(part);if(i<2){if(end==std::string::npos)return {};value.erase(0,end+1);}else if(end!=std::string::npos)return {};}
    return parts;
}
inline bool newer_version(const std::string& candidate,const std::string& current){auto a=release_version(candidate),b=release_version(current);return a&&b&&*a>*b;}
inline nlohmann::json select_release(const nlohmann::json& releases,const std::string& current,const std::string& edition){
    using nlohmann::json;json best=nullptr;if(!releases.is_array()||(edition!="full"&&edition!="core"))return best;
    const std::string base="https://github.com/CuteHeibai/foobar-smartshuffle/releases/";
    for(auto& r:releases)try{
        auto tag=r.at("tag_name").get<std::string>();if(r.value("draft",false)||!newer_version(tag,current)||(!best.is_null()&&!newer_version(tag,best.at("version"))))continue;
        auto version=tag.starts_with('v')?tag.substr(1):tag;auto asset="foobar-smartshuffle-"+edition+"-"+version+".zip";
        if(r.at("html_url")!=base+"tag/"+tag)continue;
        for(auto& a:r.at("assets"))if(a.at("name")==asset&&a.value("state",std::string{})=="uploaded"&&a.value("size",int64_t(0))>0&&a.at("browser_download_url")==base+"download/"+tag+"/"+asset){
            best={{"version",version},{"tag",tag},{"asset",asset},{"url",a.at("browser_download_url")},{"page",r.at("html_url")},{"prerelease",r.value("prerelease",false)}};break;}
    }catch(const std::exception&){/* Ignore malformed or incomplete release entries. */}
    return best;
}
}
