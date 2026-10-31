#include <windows.h>
#include <iostream>
#include "hover_focus.hpp"
int main(){
    auto root=CreateWindowExW(0,L"STATIC",L"test",WS_OVERLAPPED,0,0,100,100,nullptr,nullptr,nullptr,nullptr);
    auto surface=CreateWindowExW(0,L"STATIC",L"surface",WS_CHILD,0,0,100,100,root,nullptr,nullptr,nullptr);
    auto lyrics=CreateWindowExW(0,L"STATIC",L"lyrics",WS_CHILD,0,0,50,100,surface,nullptr,nullptr,nullptr);
    auto inside=CreateWindowExW(0,L"STATIC",L"inner",WS_CHILD,0,0,20,100,lyrics,nullptr,nullptr,nullptr);
    auto dialog=CreateWindowExW(0,L"STATIC",L"dialog",WS_OVERLAPPED,0,0,100,100,nullptr,nullptr,nullptr,nullptr);
    int failed=0,passed=0;
    auto check=[&](bool ok,const char* label){if(ok){++passed;std::cout<<"PASS "<<label<<"\n";}else{++failed;std::cout<<"FAIL "<<label<<"\n";}};
    check(HoverFocus::choose(surface,surface,root,nullptr,false,false)==surface,"Hovering script returns script focus without clicking");
    check(HoverFocus::choose(surface,inside,root,nullptr,false,false)==lyrics,"Nested lyric hit focuses its component root");
    check(!HoverFocus::choose(surface,inside,dialog,nullptr,false,false),"Open dialogs keep their focus");
    check(!HoverFocus::choose(surface,dialog,root,nullptr,false,false),"Unrelated windows are excluded");
    check(!HoverFocus::choose(surface,inside,root,surface,false,false),"Captured drags retain focus");
    check(!HoverFocus::choose(surface,inside,root,nullptr,false,true),"Pressed mouse buttons retain focus");
    check(!HoverFocus::choose(surface,inside,root,nullptr,true,false),"Native text editing retains focus");
    check(!HoverFocus::choose(nullptr,inside,root,nullptr,false,false),"Unregistered panels are excluded");
    DestroyWindow(root);DestroyWindow(dialog);
    std::cout<<passed<<" passed, "<<failed<<" failed\n";return failed?1:0;
}
