#pragma once
#include <windows.h>
#include <commctrl.h>
#include <UIAutomation.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
#include "../vendor/json.hpp"

#pragma comment(lib,"uiautomationcore.lib")
#pragma comment(lib,"oleaut32.lib")
#pragma comment(lib,"comctl32.lib")

namespace native_ss::reader {
using Json=nlohmann::json;
struct Item {
    std::string id,role;
    std::wstring name;
    int x,y,w,h;
    bool checked,disabled,focused;
    int runtimeId;
    double value,minimum,maximum,smallChange,largeChange;
};
struct Tree {
    HWND window{};
    uint64_t revision{};
    std::vector<Item> items;
};
struct Surface {
    std::mutex mutex;
    std::shared_ptr<const Tree> current=std::make_shared<Tree>();
    std::deque<Json> actions;
    uint64_t serial{};
    int nextId{};
    std::shared_ptr<const Tree> read(){
        std::lock_guard lock(mutex);return current;
    }
};
inline const Item* find(const Tree& tree,int key){
    auto i=std::find_if(tree.items.begin(),tree.items.end(),[key](const Item& item){return item.runtimeId==key;});
    return i==tree.items.end()?nullptr:&*i;
}
inline bool has_focus(HWND hwnd){
    GUITHREADINFO info{sizeof(info)};
    const auto thread=GetWindowThreadProcessId(hwnd,nullptr);
    return thread&&GetGUIThreadInfo(thread,&info)&&info.hwndFocus==hwnd;
}
inline CONTROLTYPEID type(const std::string& role){
    if(role=="menuitem")return UIA_MenuItemControlTypeId;
    if(role=="listitem")return UIA_ListItemControlTypeId;
    if(role=="slider")return UIA_SliderControlTypeId;
    if(role=="checkbox")return UIA_CheckBoxControlTypeId;
    if(role=="tab")return UIA_TabItemControlTypeId;
    if(role=="text")return UIA_TextControlTypeId;
    return UIA_ButtonControlTypeId;
}
class Node final:public IRawElementProviderSimple,public IRawElementProviderFragment,public IRawElementProviderFragmentRoot,public IInvokeProvider,public IToggleProvider,public IRangeValueProvider {
    std::atomic<ULONG> refs{1};
    std::shared_ptr<Surface> surface;
    int key;
    Node* node(int id){return new Node(surface,id);}
    HRESULT request(const char* kind,double value=0){
        std::lock_guard lock(surface->mutex);
        const auto& tree=*surface->current;
        const auto* item=find(tree,key);
        if(!item)return UIA_E_ELEMENTNOTAVAILABLE;
        if(item->disabled||item->role=="text")return UIA_E_ELEMENTNOTENABLED;
        Json action={{"id",item->id},{"kind",kind},{"revision",tree.revision},{"serial",++surface->serial}};
        if(!strcmp(kind,"setValue")){
            if(item->role!="slider"||!std::isfinite(value)||value<item->minimum||value>item->maximum)return E_INVALIDARG;
            action["value"]=value;
        }
        surface->actions.push_back(std::move(action));
        return S_OK;
    }
    HRESULT number(double Item::*field,double* out){
        if(!out)return E_POINTER;
        auto tree=surface->read();auto i=find(*tree,key);
        if(!i)return UIA_E_ELEMENTNOTAVAILABLE;
        *out=i->*field;return S_OK;
    }
public:
    Node(std::shared_ptr<Surface> s,int id=0):surface(std::move(s)),key(id){}
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid,void** out) override {
        if(!out)return E_POINTER;*out=nullptr;
        if(iid==IID_IUnknown||iid==__uuidof(IRawElementProviderSimple))*out=static_cast<IRawElementProviderSimple*>(this);
        else if(iid==__uuidof(IRawElementProviderFragment))*out=static_cast<IRawElementProviderFragment*>(this);
        else if(iid==__uuidof(IRawElementProviderFragmentRoot)&&!key)*out=static_cast<IRawElementProviderFragmentRoot*>(this);
        else if(iid==__uuidof(IInvokeProvider)&&key)*out=static_cast<IInvokeProvider*>(this);
        else if(iid==__uuidof(IToggleProvider)&&key)*out=static_cast<IToggleProvider*>(this);
        else if(iid==__uuidof(IRangeValueProvider)&&key)*out=static_cast<IRangeValueProvider*>(this);
        if(!*out)return E_NOINTERFACE;AddRef();return S_OK;
    }
    ULONG STDMETHODCALLTYPE AddRef() override{return ++refs;}
    ULONG STDMETHODCALLTYPE Release() override{auto n=--refs;if(!n)delete this;return n;}
    HRESULT STDMETHODCALLTYPE get_ProviderOptions(ProviderOptions* out) override{*out=ProviderOptions_ServerSideProvider;return S_OK;}
    HRESULT STDMETHODCALLTYPE GetPatternProvider(PATTERNID pattern,IUnknown** out) override{
        *out=nullptr;if(!key)return S_OK;
        auto tree=surface->read();const auto* item=find(*tree,key);if(!item)return UIA_E_ELEMENTNOTAVAILABLE;
        if(pattern==UIA_RangeValuePatternId&&item->role=="slider")return QueryInterface(__uuidof(IRangeValueProvider),reinterpret_cast<void**>(out));
        if(pattern==UIA_InvokePatternId&&item->role!="text"&&item->role!="slider")return QueryInterface(__uuidof(IInvokeProvider),reinterpret_cast<void**>(out));
        if(pattern==UIA_TogglePatternId&&item->role=="checkbox")return QueryInterface(__uuidof(IToggleProvider),reinterpret_cast<void**>(out));
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GetPropertyValue(PROPERTYID prop,VARIANT* out) override{
        VariantInit(out);auto tree=surface->read();const auto* item=find(*tree,key);
        if(!tree->window||(key&&!item))return UIA_E_ELEMENTNOTAVAILABLE;
        if(prop==UIA_NamePropertyId){out->vt=VT_BSTR;out->bstrVal=SysAllocString(item?item->name.c_str():L"音乐播放器");}
        else if(prop==UIA_ItemStatusPropertyId&&item&&item->checked){out->vt=VT_BSTR;out->bstrVal=SysAllocString(L"已选中");}
        else if(prop==UIA_ControlTypePropertyId){out->vt=VT_I4;out->lVal=item?type(item->role):UIA_PaneControlTypeId;}
        else if(prop==UIA_IsEnabledPropertyId||prop==UIA_IsKeyboardFocusablePropertyId||prop==UIA_HasKeyboardFocusPropertyId||prop==UIA_IsControlElementPropertyId||prop==UIA_IsContentElementPropertyId){
            bool value=prop==UIA_IsEnabledPropertyId?(!item||!item->disabled):prop==UIA_IsKeyboardFocusablePropertyId?(item&&item->role!="text"&&!item->disabled):prop==UIA_HasKeyboardFocusPropertyId?(item&&item->focused&&has_focus(tree->window)):true;
            out->vt=VT_BOOL;out->boolVal=value?VARIANT_TRUE:VARIANT_FALSE;
        }
        return S_OK;
    }
    HRESULT STDMETHODCALLTYPE get_HostRawElementProvider(IRawElementProviderSimple** out) override{
        *out=nullptr;if(key)return S_OK;auto hwnd=surface->read()->window;return hwnd?UiaHostProviderFromHwnd(hwnd,out):UIA_E_ELEMENTNOTAVAILABLE;
    }
    HRESULT STDMETHODCALLTYPE Navigate(NavigateDirection dir,IRawElementProviderFragment** out) override{
        *out=nullptr;auto tree=surface->read();const auto& rows=tree->items;
        if(!tree->window)return UIA_E_ELEMENTNOTAVAILABLE;
        if(!key){if(!rows.empty()&&(dir==NavigateDirection_FirstChild||dir==NavigateDirection_LastChild))*out=node((dir==NavigateDirection_FirstChild?rows.front():rows.back()).runtimeId);}
        else {auto item=find(*tree,key);if(!item)return UIA_E_ELEMENTNOTAVAILABLE;
            if(dir==NavigateDirection_Parent)*out=node(0);
            if(dir==NavigateDirection_NextSibling&&item!=&rows.back())*out=node((item+1)->runtimeId);
            if(dir==NavigateDirection_PreviousSibling&&item!=rows.data())*out=node((item-1)->runtimeId);
        }return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GetRuntimeId(SAFEARRAY** out) override{
        *out=nullptr;if(!key)return S_OK;
        *out=SafeArrayCreateVector(VT_I4,0,2);if(!*out)return E_OUTOFMEMORY;
        LONG i=0,a=UiaAppendRuntimeId,b=key;SafeArrayPutElement(*out,&i,&a);++i;return SafeArrayPutElement(*out,&i,&b);
    }
    HRESULT STDMETHODCALLTYPE get_BoundingRectangle(UiaRect* out) override{
        *out={};auto tree=surface->read();if(!tree->window)return UIA_E_ELEMENTNOTAVAILABLE;
        if(!key){RECT r{};GetWindowRect(tree->window,&r);*out={double(r.left),double(r.top),double(r.right-r.left),double(r.bottom-r.top)};}
        else{auto i=find(*tree,key);if(!i)return UIA_E_ELEMENTNOTAVAILABLE;POINT p{i->x,i->y};ClientToScreen(tree->window,&p);*out={double(p.x),double(p.y),double(i->w),double(i->h)};}return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GetEmbeddedFragmentRoots(SAFEARRAY** out) override{*out=nullptr;return S_OK;}
    HRESULT STDMETHODCALLTYPE SetFocus() override{return key?request("focus"):S_OK;}
    HRESULT STDMETHODCALLTYPE get_FragmentRoot(IRawElementProviderFragmentRoot** out) override{*out=node(0);return S_OK;}
    HRESULT STDMETHODCALLTYPE ElementProviderFromPoint(double x,double y,IRawElementProviderFragment** out) override{
        *out=nullptr;auto tree=surface->read();if(!tree->window)return UIA_E_ELEMENTNOTAVAILABLE;
        POINT p{LONG(x),LONG(y)};ScreenToClient(tree->window,&p);
        for(auto it=tree->items.rbegin();it!=tree->items.rend();++it)if(it->x<=p.x&&p.x<it->x+it->w&&it->y<=p.y&&p.y<it->y+it->h){*out=node(it->runtimeId);break;}
        if(!*out)*out=node(0);return S_OK;
    }
    HRESULT STDMETHODCALLTYPE GetFocus(IRawElementProviderFragment** out) override{
        *out=nullptr;auto tree=surface->read();if(!has_focus(tree->window))return S_OK;
        for(auto& i:tree->items)if(i.focused){*out=node(i.runtimeId);break;}return S_OK;
    }
    HRESULT STDMETHODCALLTYPE Invoke() override{return request("invoke");}
    HRESULT STDMETHODCALLTYPE SetValue(double value) override{return request("setValue",value);}
    HRESULT STDMETHODCALLTYPE get_Value(double* out) override{return number(&Item::value,out);}
    HRESULT STDMETHODCALLTYPE get_Minimum(double* out) override{return number(&Item::minimum,out);}
    HRESULT STDMETHODCALLTYPE get_Maximum(double* out) override{return number(&Item::maximum,out);}
    HRESULT STDMETHODCALLTYPE get_SmallChange(double* out) override{return number(&Item::smallChange,out);}
    HRESULT STDMETHODCALLTYPE get_LargeChange(double* out) override{return number(&Item::largeChange,out);}
    HRESULT STDMETHODCALLTYPE get_IsReadOnly(BOOL* out) override{
        if(!out)return E_POINTER;
        auto tree=surface->read();auto i=find(*tree,key);
        if(!i)return UIA_E_ELEMENTNOTAVAILABLE;
        *out=i->disabled;return S_OK;
    }
    HRESULT STDMETHODCALLTYPE Toggle() override{return request("invoke");}
    HRESULT STDMETHODCALLTYPE get_ToggleState(ToggleState* out) override{
        auto tree=surface->read();auto item=find(*tree,key);if(!item)return UIA_E_ELEMENTNOTAVAILABLE;*out=item->checked?ToggleState_On:ToggleState_Off;return S_OK;
    }
};
class Host {
    std::shared_ptr<Surface> surface=std::make_shared<Surface>();
    HWND panel{};
    static LRESULT CALLBACK wndproc(HWND hwnd,UINT msg,WPARAM wp,LPARAM lp,UINT_PTR id,DWORD_PTR data){
        auto& h=*reinterpret_cast<Host*>(data);
        if(msg==WM_GETOBJECT&&static_cast<LONG>(lp)==UiaRootObjectId){
            auto provider=new Node(h.surface);auto result=UiaReturnRawElementProvider(hwnd,wp,lp,provider);provider->Release();return result;
        }
        if(msg==WM_NCDESTROY)h.detach();
        return DefSubclassProc(hwnd,msg,wp,lp);
    }
    void detach(){
        if(!panel)return;
        RemoveWindowSubclass(panel,wndproc,reinterpret_cast<UINT_PTR>(this));
        UiaReturnRawElementProvider(panel,0,0,nullptr);
        std::lock_guard lock(surface->mutex);surface->current=std::make_shared<Tree>();surface->actions.clear();panel=nullptr;
    }
public:
    ~Host(){detach();}
    void attach(HWND hwnd){
        detach();DWORD pid=0;wchar_t cls[128]{};
        if(GetWindowThreadProcessId(hwnd,&pid)!=GetCurrentThreadId()||pid!=GetCurrentProcessId())return;
        GetClassNameW(hwnd,cls,128);if(_wcsicmp(cls,L"foo_uie_jsplitter_class")!=0)return;
        if(!SetWindowSubclass(hwnd,wndproc,reinterpret_cast<UINT_PTR>(this),reinterpret_cast<DWORD_PTR>(this)))return;
        panel=hwnd;auto tree=std::make_shared<Tree>();tree->window=hwnd;std::lock_guard lock(surface->mutex);surface->current=tree;
    }
    void update(const Json& model){
        if(!panel)return;auto old=surface->read();auto tree=std::make_shared<Tree>();tree->window=panel;tree->revision=model.at("revision").get<uint64_t>();
        bool structure=false;int focus=0;
        for(auto& r:model.at("items")){
            auto name=r.at("name").get<std::string>();auto n=MultiByteToWideChar(CP_UTF8,0,name.data(),int(name.size()),nullptr,0);std::wstring title(n,0);
            if(n)MultiByteToWideChar(CP_UTF8,0,name.data(),int(name.size()),title.data(),n);
            Item i{r.at("id").get<std::string>(),r.value("role",std::string("button")),std::move(title),r.at("x").get<int>(),r.at("y").get<int>(),r.at("w").get<int>(),r.at("h").get<int>(),r.value("checked",false),r.value("disabled",false),r.value("focused",false),0, r.value("value",0.0),r.value("min",0.0),r.value("max",100.0),r.value("smallChange",1.0),r.value("largeChange",10.0)};
            auto prev=std::find_if(old->items.begin(),old->items.end(),[&](const Item& v){return v.id==i.id;});
            i.runtimeId=prev==old->items.end()?++surface->nextId:prev->runtimeId;
            if(i.focused&&(prev==old->items.end()||!prev->focused))focus=i.runtimeId;
            auto pos=tree->items.size();if(pos>=old->items.size()||old->items[pos].runtimeId!=i.runtimeId)structure=true;
            tree->items.push_back(std::move(i));
        }
        structure|=tree->items.size()!=old->items.size();
        {std::lock_guard lock(surface->mutex);surface->current=tree;}
        if(UiaClientsAreListening()){
            if(structure){auto root=new Node(surface);UiaRaiseStructureChangedEvent(root,StructureChangeType_ChildrenInvalidated,nullptr,0);root->Release();}
            if(focus&&::GetFocus()==panel){auto node=new Node(surface,focus);UiaRaiseAutomationEvent(node,UIA_AutomationFocusChangedEventId);node->Release();}
            if(!structure)for(size_t k=0;k<tree->items.size();++k)if(tree->items[k].name!=old->items[k].name){
                auto n=new Node(surface,tree->items[k].runtimeId);VARIANT a{},b{};a.vt=b.vt=VT_BSTR;a.bstrVal=SysAllocString(old->items[k].name.c_str());b.bstrVal=SysAllocString(tree->items[k].name.c_str());
                UiaRaiseAutomationPropertyChangedEvent(n,UIA_NamePropertyId,a,b);VariantClear(&a);VariantClear(&b);n->Release();
            }
        }
    }
    bool next(Json& action){
        std::lock_guard lock(surface->mutex);if(surface->actions.empty())return false;
        action=std::move(surface->actions.front());surface->actions.pop_front();return true;
    }
};
}
