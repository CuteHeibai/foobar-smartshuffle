#include "scanner.hpp"
#include <fstream>
#include <chrono>
#include <algorithm>
#include <cmath>
#include <set>

namespace native_ss {
using namespace std::chrono_literals;
Scanner::Scanner(std::filesystem::path p):root(std::move(p)),thread([this]{run();}) {}
Scanner::~Scanner(){ stopping=true; abort.abort(); if(thread.joinable())thread.join(); }
void Scanner::enqueue(ScanJob j,bool priority){std::lock_guard lock(mutex);if(j.fingerprint==active)return;for(auto it=jobs.begin();it!=jobs.end();++it)if(it->fingerprint==j.fingerprint){if(priority){auto queued=std::move(*it);jobs.erase(it);jobs.push_front(std::move(queued));}return;}if(priority)jobs.push_front(std::move(j));else jobs.push_back(std::move(j));}
size_t Scanner::pending(){std::lock_guard lock(mutex);return jobs.size()+(active.empty()?0:1);}
std::string Scanner::current(){std::lock_guard lock(mutex);return active;}
std::vector<ScanResult> Scanner::results(){std::lock_guard lock(mutex);std::vector<ScanResult> ret;ret.swap(finished);return ret;}
void Scanner::run(){
    CoInitializeEx(nullptr,COINIT_MULTITHREADED);
    SetThreadPriority(GetCurrentThread(),THREAD_PRIORITY_BELOW_NORMAL);
    while(!stopping){
        ScanJob job;
        {std::lock_guard lock(mutex); if(!paused && !jobs.empty()){job=std::move(jobs.front());jobs.pop_front();active=job.fingerprint;}}
        if(job.id.empty()){std::this_thread::sleep_for(100ms);continue;}
        auto result=analyze(job);
        {std::lock_guard lock(mutex);active.clear();finished.push_back(std::move(result));}
    }
    CoUninitialize();
}
static void put32(std::ofstream& f,uint32_t v){f.write(reinterpret_cast<const char*>(&v),4);}
static void put16(std::ofstream& f,uint16_t v){f.write(reinterpret_cast<const char*>(&v),2);}
ScanResult Scanner::analyze(const ScanJob& job){
    ScanResult result{job.id,job.fingerprint};
    auto wav=root/L"scan-sample.wav", output=root/L"scan-result.json";
    try {
        auto exe=root/L"runtime"/L"smartshuffle-analyzer"/L"smartshuffle-analyzer.exe";
        if(!std::filesystem::exists(exe))throw std::runtime_error("本地音频分析工具未安装");
        service_ptr_t<input_decoder> decoder;
        input_entry::g_open_for_decoding(decoder,{},job.handle->get_path(),abort);
        const auto sub=job.handle->get_subsong_index();
        file_info_impl info;decoder->get_info(sub,info,abort);
        double length=info.get_length();
        if(!(length>0 && std::isfinite(length)))throw std::runtime_error("不支持未知长度的音频");
        decoder->initialize(sub,input_flag_no_looping,abort);
        std::vector<std::pair<double,double>> ranges;
        for(double p:{.2,.5,.8}){
            double start=std::max(0.0,std::min(length-20,length*p-10)),end=std::min(length,start+20);
            if(!ranges.empty()&&start<=ranges.back().second)ranges.back().second=std::max(ranges.back().second,end);
            else ranges.push_back({start,end});
        }
        if(!decoder->can_seek()){ranges={{0,std::min(60.0,length)}};}
        std::vector<float> samples; unsigned sampleRate=0;
        for(auto range:ranges){
            if(decoder->can_seek())decoder->seek(range.first,abort);
            double elapsed=0;
            while(elapsed<range.second-range.first){
                abort.check();audio_chunk_impl chunk;
                if(!decoder->run(chunk,abort))break;
                unsigned rate=chunk.get_srate(),channels=chunk.get_channel_count();
                if(!rate||!channels)continue;
                if(!sampleRate)sampleRate=rate;
                if(sampleRate!=rate)throw std::runtime_error("音频采样率在曲目内变化");
                auto count=std::min<size_t>(chunk.get_sample_count(),size_t(std::ceil((range.second-range.first-elapsed)*rate)));
                const auto data=chunk.get_data();
                for(size_t i=0;i<count;++i){double v=0;for(unsigned c=0;c<channels;++c)v+=data[i*channels+c];samples.push_back(float(v/channels));}
                elapsed+=double(count)/rate;
            }
        }
        if(samples.empty())throw std::runtime_error("未解码到音频样本");
        {std::ofstream f(wav,std::ios::binary|std::ios::trunc);uint32_t bytes=uint32_t(samples.size()*4);
         f.write("RIFF",4);put32(f,36+bytes);f.write("WAVEfmt ",8);put32(f,16);put16(f,3);put16(f,1);put32(f,sampleRate);put32(f,sampleRate*4);put16(f,4);put16(f,32);f.write("data",4);put32(f,bytes);f.write(reinterpret_cast<const char*>(samples.data()),bytes);if(!f)throw std::runtime_error("无法写入分析样本");}
        std::error_code ec;std::filesystem::remove(output,ec);
        std::wstring command=L"\""+exe.wstring()+L"\" --input \""+wav.wstring()+L"\" --output \""+output.wstring()+L"\"";
        STARTUPINFOW si{};si.cb=sizeof(si);PROCESS_INFORMATION pi{};
        if(!CreateProcessW(exe.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW|BELOW_NORMAL_PRIORITY_CLASS,nullptr,root.c_str(),&si,&pi))throw std::runtime_error("无法启动本地分析工具");
        CloseHandle(pi.hThread);
        auto started=std::chrono::steady_clock::now();
        while(WaitForSingleObject(pi.hProcess,100)==WAIT_TIMEOUT){
            if(stopping||std::chrono::steady_clock::now()-started>180s){TerminateProcess(pi.hProcess,1);WaitForSingleObject(pi.hProcess,2000);CloseHandle(pi.hProcess);throw std::runtime_error(stopping?"扫描已停止":"音频分析超时");}
        }
        DWORD code;GetExitCodeProcess(pi.hProcess,&code);CloseHandle(pi.hProcess);
        std::ifstream f(output);nlohmann::json j;f>>j;
        if(code||!j.value("ok",false))throw std::runtime_error(j.value("error",std::string("音频分析失败")));
        result.features=j.at("features").get<std::vector<double>>();
        if(result.features.size()!=65||!std::all_of(result.features.begin(),result.features.end(),[](double v){return std::isfinite(v);}))throw std::runtime_error("无效的音频分析特征");
    }catch(const std::exception& ex){result.error=ex.what();}catch(...){result.error="解码或分析失败";}
    std::error_code ec;std::filesystem::remove(wav,ec);std::filesystem::remove(output,ec);
    return result;
}
}
