#include "updater.hpp"
#include "dialog_geometry.hpp"
#include <iostream>
#include <stdexcept>
using nlohmann::json;
void check(bool ok,const char* name){if(!ok)throw std::runtime_error(name);std::cout<<"PASS "<<name<<'\n';}
json release(std::string version,bool draft=false){std::string prefix="https://github.com/CuteHeibai/foobar-smartshuffle/releases/";json r={{"tag_name","v"+version},{"draft",draft},{"prerelease",true},{"html_url",prefix+"tag/v"+version},{"assets",json::array()}};for(auto edition:{"full","core"}){auto name="foobar-smartshuffle-"+std::string(edition)+"-"+version+".zip";r["assets"].push_back({{"name",name},{"state","uploaded"},{"size",100},{"browser_download_url",prefix+"download/v"+version+"/"+name}});}return r;}
int main(int argc,char**){
 try{
  using namespace native_ss;
  check(installation_edition(json::object(),true)=="full"&&installation_edition(json::object(),false)=="core"&&installation_edition(json{{"edition","core"}},true)=="core","Legacy themes infer full edition while explicit core manifests keep their choice");
  check(newer_version("v1.0.10","1.0.9"),"Versions compare numerically, not lexically");
  check(!newer_version("v1.0.5","1.0.5")&&!newer_version("v1.0.4","1.0.5"),"Same and older releases never prompt a downgrade");
  check(!newer_version("garbage","1.0.5")&&!newer_version("1.0.5-extra","1.0.5"),"Unsupported version tags are ignored");
  auto list=json::array({release("1.0.7",true),release("1.0.6"),release("1.0.5")});
  auto full=select_release(list,"1.0.5","full"),core=select_release(list,"1.0.5","core");
  check(full.at("version")=="1.0.6"&&full.at("asset").get<std::string>().find("full-")!=std::string::npos,"Full edition picks its own published package, including test releases");
  check(core.at("version")=="1.0.6"&&core.at("asset").get<std::string>().find("core-")!=std::string::npos,"Core edition never downloads a theme package");
  list[1]["assets"][1]["state"]="new";
  check(select_release(list,"1.0.5","core").is_null(),"Incomplete uploads are skipped");
  list[1]["assets"][0]["browser_download_url"]="https://example.com/malicious.zip";
  check(select_release(list,"1.0.5","full").is_null(),"Download links must belong to this repository and version");
  check(select_release(json::object(),"1.0.5","full").is_null(),"Malformed release lists cannot supply an update");
  check(select_release(json::array({release("2.0.0"),release("1.9.9")}),"1.0.5","core")["version"]=="2.0.0","Unordered responses still select the highest complete release");
  for(auto systemDpi:{96,120,144,192})for(auto height:{480,600,680,720}){int dpi=dialog_dpi(600,height,systemDpi,false);auto px=[dpi](int v){return v*dpi/96;};int grid=std::max(px(80),std::min({px(236),600-px(160),height-px(472)}));check(px(328)+grid+px(30)<=height-px(98),"Constrained DPI layout keeps axis labels above the preset buttons");}
  if(argc>1){auto live=github_releases();check(live.is_array()&&!live.empty(),"Live GitHub HTTPS response contains published releases");}
 }catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}
 std::cout<<"26 update and layout checks passed\n";
}
