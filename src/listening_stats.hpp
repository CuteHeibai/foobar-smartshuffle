#pragma once
#include "json.hpp"
#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace ss {
struct ListeningRow {
    std::string id, title, artist, album;
    unsigned samples=0, plays=0, switches=0, ended=0, positive=0, ratios=0;
    double seconds=0, endedSeconds=0, ratioSum=0;
    int64_t latest=-1;

    void add(const nlohmann::json& event) {
        double elapsed=event.at("listened").get<double>();
        auto start=event.at("started_at").get<int64_t>();
        if(start>latest){
            latest=start;title=event.value("title",std::string{});
            artist=event.value("artist",std::string{});album=event.value("album",std::string{});
        }
        ++samples;seconds+=elapsed;
        if(event.at("qualified").get<bool>())++plays;
        auto outcome=event.at("outcome").get<std::string>();
        if(outcome=="playing")return;
        ++ended;endedSeconds+=elapsed;
        if(elapsed>0)++positive;
        if(outcome=="switched")++switches;
        double duration=event.at("duration").get<double>();
        if(duration>0){ratioSum+=std::min(1.0,elapsed/duration);++ratios;}
    }

    double score(unsigned maxPlays) const {
        double result=maxPlays?50*std::log1p(plays)/std::log1p(maxPlays):0;
        result+=25*(1.0-double(switches)/ended);
        return ratios?result+25*ratioSum/ratios:result/.75;
    }
};

template<class History,class Day>
nlohmann::json listening_stats(const History& history,const std::set<std::string>& zeroIds,
    const std::string& from,const std::string& to,const std::string& order,
    bool ascending,size_t offset,size_t limit,Day day) {
    using json=nlohmann::json;
    std::map<std::string,ListeningRow> songs,artists,albums;
    std::map<std::string,double> daily;
    unsigned plays=0,unique=0,maxPlays=0;
    double seconds=0;
    std::string first,last;
    for(const auto& e:history){
        auto date=std::string(day(e.at("started_at").template get<int64_t>()));
        if(date.empty())continue;
        if(first.empty()||date<first)first=date;
        if(last.empty()||date>last)last=date;
        if(date<from||date>to)continue;
        const auto& id=e.at("id").template get_ref<const std::string&>();
        auto& row=songs[id];row.id=id;row.add(e);
        auto artist=e.value("artist",std::string{}),album=e.value("album",std::string{});
        if(!artist.empty())artists[artist].add(e);
        if(!album.empty())albums[json::array({artist,album}).dump()].add(e);
        double elapsed=e.at("listened").template get<double>();
        seconds+=elapsed;daily[date]+=elapsed;
        if(e.at("qualified").template get<bool>())++plays;
    }
    for(auto& [id,row]:songs){if(row.seconds>0)++unique;maxPlays=std::max(maxPlays,row.plays);}
    if(order=="plays"&&ascending)for(auto& id:zeroIds)songs[id].id=id;

    std::vector<const ListeningRow*> ordered;
    for(auto& [id,row]:songs)
        if((order!="score"||row.positive)&&(order!="average"||row.samples))ordered.push_back(&row);
    auto metric=[&](const ListeningRow& row){
        if(order=="score")return row.score(maxPlays);
        if(order=="average")return row.seconds/row.samples;
        if(order=="switches")return double(row.switches);
        return double(row.plays);
    };
    std::sort(ordered.begin(),ordered.end(),[&](auto a,auto b){
        auto left=metric(*a),right=metric(*b);
        if(left!=right)return ascending?left<right:left>right;
        return a->id<b->id;
    });
    json rows=json::array();
    for(size_t i=std::min(offset,ordered.size());i<ordered.size()&&i-offset<limit;++i){
        const auto& row=*ordered[i];
        rows.push_back({{"id",row.id},{"title",row.title},{"artist",row.artist},{"album",row.album},
            {"samples",row.samples},{"plays",row.plays},{"switches",row.switches},
            {"average",row.samples?json(row.seconds/row.samples):json(nullptr)},
            {"score",row.positive?json(row.score(maxPlays)):json(nullptr)}});
    }
    auto top=[](const auto& groups,bool album){
        std::vector<const ListeningRow*> rank;
        for(auto& [id,row]:groups)rank.push_back(&row);
        std::stable_sort(rank.begin(),rank.end(),[](auto a,auto b){
            return a->plays!=b->plays?a->plays>b->plays:a->seconds>b->seconds;
        });
        json result=json::array();
        for(size_t i=0;i<rank.size()&&i<10;++i){
            const auto& row=*rank[i];
            result.push_back({{"name",album?row.album:row.artist},{"artist",album?row.artist:std::string{}},
                {"plays",row.plays},{"seconds",row.seconds}});
        }
        return result;
    };
    return {{"rows",std::move(rows)},{"total",ordered.size()},{"first",first},{"last",last},
        {"overview",{{"seconds",seconds},{"plays",plays},{"unique",unique},{"daily",daily},
            {"artists",top(artists,false)},{"albums",top(albums,true)}}}};
}
}
