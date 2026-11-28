#include <foobar2000/SDK/foobar2000.h>
#include <gdiplus.h>
#include <dwmapi.h>
#include <foobar2000/SDK/coreDarkMode.h>
#include "native_palette.hpp"
#pragma comment(lib,"dwmapi.lib")
#include <windowsx.h>
#include "native_dialogs.hpp"
#include "dialog_geometry.hpp"
#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>
#pragma comment(lib,"gdiplus.lib")
namespace native_ss {
namespace {
using json=nlohmann::json;
DialogDispatch dispatch;std::function<json()> readState;
HWND preference=nullptr,updates=nullptr;
std::wstring wide(const std::string& s){int n=MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),nullptr,0);std::wstring out(n,0);MultiByteToWideChar(CP_UTF8,0,s.data(),int(s.size()),out.data(),n);return out;}
json send(json j){j["version"]=1;if(!dispatch)return {{"ok",false}};return dispatch(std::move(j));}
int window_dpi(HWND w){using Fn=UINT(WINAPI*)(HWND);auto fn=reinterpret_cast<Fn>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"GetDpiForWindow"));if(fn)return int(fn(w));auto dc=GetDC(w);int dpi=GetDeviceCaps(dc,LOGPIXELSY);ReleaseDC(w,dc);return dpi;}
Gdiplus::Color ink(COLORREF rgb, BYTE alpha=255){
 return Gdiplus::Color(alpha,GetRValue(rgb),GetGValue(rgb),GetBValue(rgb));
}
constexpr UINT appearanceChanged=WM_APP+1;
class Panel : private ui_config_callback_impl {
public:
 HWND window=nullptr,apply=nullptr,automatic=nullptr;bool registered=false,ownedByWindow=false,update=false,drag=false,waiting=false,closed=false;int dpi=96;double x=0,y=0;std::string token;json state;RECT grid{};HFONT font=nullptr;HBRUSH background=nullptr;ULONG_PTR gdip=0;
 bool dark=native_dark_mode();
 NativePalette palette=native_palette(dark);
 fb2k::CCoreDarkModeHooks darkHooks{dark};
 void ui_colors_changed() override { if(window)refresh_appearance(); }
 void refresh_appearance(){
  bool next=native_dark_mode();
  if(background&&dark==next)return;
  auto colors=native_palette(next);
  auto brush=CreateSolidBrush(colors.background);
  if(!brush)return;
  if(background)DeleteObject(background);
  background=brush;dark=next;palette=colors;
  darkHooks.SetDark(dark);
  BOOL useDark=dark;
  DwmSetWindowAttribute(window,20,&useDark,sizeof(useDark));
  RedrawWindow(window,nullptr,nullptr,RDW_INVALIDATE|RDW_ERASE|RDW_FRAME|RDW_ALLCHILDREN);
 }
 std::vector<HWND> buttons;std::vector<POINT> trail;HFONT titleFont=nullptr;
 explicit Panel(bool update):update(update){Gdiplus::GdiplusStartupInput input;Gdiplus::GdiplusStartup(&gdip,&input,nullptr);}
 ~Panel(){if(font)DeleteObject(font);if(titleFont)DeleteObject(titleFont);if(background)DeleteObject(background);if(gdip)Gdiplus::GdiplusShutdown(gdip);}
 int px(int n)const{return MulDiv(n,dpi,96);}
 void rebuild_fonts(){
  if(font)DeleteObject(font);if(titleFont)DeleteObject(titleFont);
  font=CreateFontW(-px(14),0,0,0,FW_NORMAL,0,0,0,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Microsoft YaHei UI");
  titleFont=CreateFontW(-px(20),0,0,0,FW_SEMIBOLD,0,0,0,DEFAULT_CHARSET,OUT_DEFAULT_PRECIS,CLIP_DEFAULT_PRECIS,CLEARTYPE_QUALITY,DEFAULT_PITCH,L"Microsoft YaHei UI");
 }
 void create(HWND w){window=w;dpi=window_dpi(w);rebuild_fonts();refresh_appearance();
  if(update){button(L"立即检查",1101);button(L"更新并重启",1102);button(L"关闭",IDCANCEL);automatic=CreateWindowW(L"BUTTON",L"启动时检查 GitHub 更新",WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_AUTOCHECKBOX,0,0,0,0,w,reinterpret_cast<HMENU>(1103),core_api::get_my_instance(),nullptr);SendMessageW(automatic,WM_SETFONT,reinterpret_cast<WPARAM>(font),0);}
  else{button(L"均衡",1201);button(L"常听优先",1202);button(L"少听探索",1203);button(L"取消",IDCANCEL);apply=button(L"应用",IDOK);EnableWindow(apply,FALSE);}
  darkHooks.AddControls(w);refresh();if(!update&&state.contains("point")){x=state["point"].value("x",0.0);y=state["point"].value("y",0.0);}layout();SetTimer(w,1,160,nullptr);modeless_dialog_manager::g_add(w);registered=true;
 }
 HWND button(const wchar_t* name,int id){auto h=CreateWindowW(L"BUTTON",name,WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_OWNERDRAW,0,0,0,0,window,reinterpret_cast<HMENU>(INT_PTR(id)),core_api::get_my_instance(),nullptr);SendMessageW(h,WM_SETFONT,reinterpret_cast<WPARAM>(font),0);buttons.push_back(h);return h;}
 void layout(){RECT r;GetClientRect(window,&r);int w=r.right,h=r.bottom,p=px(24),bw=px(108),bh=px(36);
  int scale=dialog_dpi(w,h,window_dpi(window),update);if(scale!=dpi){dpi=scale;rebuild_fonts();for(auto b:buttons)SendMessageW(b,WM_SETFONT,reinterpret_cast<WPARAM>(font),TRUE);if(automatic)SendMessageW(automatic,WM_SETFONT,reinterpret_cast<WPARAM>(font),TRUE);p=px(24);bw=px(108);bh=px(36);}
  if(update){
   MoveWindow(automatic,p,px(154),w-2*p,px(28),TRUE);
   int gap=px(10),closeW=px(84),installW=px(116),checkW=px(104),by=h-p-bh;
   MoveWindow(buttons[0],p,by,checkW,bh,TRUE);
   MoveWindow(buttons[2],std::max(p+checkW+gap,w-p-installW-gap-closeW),by,closeW,bh,TRUE);
   MoveWindow(buttons[1],w-p-installW,by,installW,bh,TRUE);
  }
  else{int size=std::max(px(80),std::min({px(236),w-px(160),h-px(472)})),left=(w-size)/2;grid={left,px(328),left+size,px(328)+size};
   for(int i=0;i<3;i++)MoveWindow(buttons[i],p+i*(bw+px(8)),h-px(102),bw,bh,TRUE);MoveWindow(buttons[3],w-p-2*bw-px(12),h-p-bh,bw,bh,TRUE);MoveWindow(buttons[4],w-p-bw,h-p-bh,bw,bh,TRUE);}
  InvalidateRect(window,nullptr,FALSE);
 }
 bool ready()const{if(waiting||drag||!state.contains("preview")||state["preview"].is_null()||state.value("preview_pending",true))return false;auto& p=state["preview"];return !p.value("token",std::string{}).empty()&&p.value("revision",uint64_t(0))==state.value("revision",uint64_t(0))&&std::abs(p["point"].value("x",2.0)-x)<.00001&&std::abs(p["point"].value("y",2.0)-y)<.00001;}
 void refresh(){if(!readState)return;auto next=readState();if(next!=state){state=std::move(next);InvalidateRect(window,nullptr,FALSE);}if(update){auto s=state.value("update",json::object());auto phase=s.value("phase",std::string{});bool busy=phase=="downloading"||phase=="installing";SendMessageW(automatic,BM_SETCHECK,s.value("automatic",true)?BST_CHECKED:BST_UNCHECKED,0);EnableWindow(buttons[0],!busy&&!s.value("checking",false));EnableWindow(buttons[1],!busy&&!s.value("checking",false)&&s.value("available",false));SetWindowTextW(buttons[1],busy?L"正在更新…":L"更新并重启");}else EnableWindow(apply,ready());}
 void draft(double a,double b){x=std::clamp(a,-1.0,1.0);y=std::clamp(b,-1.0,1.0);token.clear();waiting=true;EnableWindow(apply,FALSE);SetTimer(window,2,150,nullptr);InvalidateRect(window,nullptr,FALSE);}
 void point(LPARAM lp){int gx=GET_X_LPARAM(lp),gy=GET_Y_LPARAM(lp);trail.push_back({std::clamp(LONG(gx),grid.left,grid.right),std::clamp(LONG(gy),grid.top,grid.bottom)});if(trail.size()>7)trail.erase(trail.begin());draft(2.0*(gx-grid.left)/std::max(1L,grid.right-grid.left)-1,1-2.0*(gy-grid.top)/std::max(1L,grid.bottom-grid.top));}
 void cancel(){if(!update&&!closed)send({{"op","cancel"}});closed=true;DestroyWindow(window);}
 void command(int id){
  if(id==IDCANCEL){cancel();return;}
  if(update){if(id==1101)send({{"op","update_check"}});else if(id==1102)send({{"op","update_install"}});else if(id==1103)send({{"op","update_config"},{"automatic",SendMessageW(automatic,BM_GETCHECK,0,0)==BST_CHECKED}});refresh();return;}
  if(id>=1201&&id<=1203){draft(id==1201?0:id==1202?.75:-.75,0);return;}
  if(id==IDOK&&ready()){auto response=send({{"op","apply"},{"token",state["preview"]["token"]}});if(response.value("ok",false)){closed=true;DestroyWindow(window);}else refresh();}
 }
 void text(HDC dc,std::wstring s,RECT r,COLORREF color,UINT align=DT_LEFT){SetTextColor(dc,color);DrawTextW(dc,s.c_str(),int(s.size()),&r,align|DT_SINGLELINE|DT_VCENTER|DT_END_ELLIPSIS|DT_NOPREFIX);}
 void paint(HDC dc,int w,int h){auto mem=CreateCompatibleDC(dc);auto image=CreateCompatibleBitmap(dc,w,h);auto old=SelectObject(mem,image);RECT all{0,0,w,h};FillRect(mem,&all,background);auto oldFont=SelectObject(mem,font);SetBkMode(mem,TRANSPARENT);int p=px(24);
  if(update){auto s=state.value("update",json::object());std::string label=s.value("checking",false)?"正在检查更新…":s.value("available",false)?"发现新版本 "+s["release"].value("version",std::string{}):!s.value("error",std::string{}).empty()?s["error"].get<std::string>():s.contains("checked_at")?"当前已是最新版本":"从 GitHub 获取更新信息";
   auto phase=s.value("phase",std::string{});double fraction=std::clamp(double(s.value("downloaded",uint64_t(0)))/std::max(1.0,double(s.value("total",uint64_t(0)))),0.0,1.0);
   if(phase=="downloading")label="正在下载更新 · "+std::to_string(int(fraction*100))+"%";
   else if(phase=="installing")label="正在校验和安装，完成后重新打开…";
   else if(!s.value("error",std::string{}).empty())label=s["error"].get<std::string>();
   SelectObject(mem,titleFont);
   text(mem,wide(label),{p,px(22),w-p,px(54)},palette.foreground);
   SelectObject(mem,font);
   text(mem,wide("当前版本 "+s.value("current",std::string{})+" · "+(s.value("edition",std::string{})=="core"?"独立插件版":"完整版")),{p,px(60),w-p,px(84)},palette.secondary);
   auto previous=s.value("last_result",json::object());auto previousError=previous.is_object()&&previous.contains("error")&&previous["error"].is_string()?previous["error"].get<std::string>():std::string{};
   text(mem,previousError.empty()?L"点击后自动下载、校验、备份并安装，再重新打开。":wide("上次更新失败："+previousError),{p,px(92),w-p,px(120)},palette.secondary);
   if(phase=="downloading"){
    Gdiplus::Graphics g(mem);g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
    float rx=float(p),ry=float(px(132)),rw=float(std::max(1,w-2*p)),rh=float(px(6));
    Gdiplus::GraphicsPath bgPath;add_round_rect(bgPath,rx,ry,rw,rh,rh*0.5f);
    Gdiplus::SolidBrush bgBrush(gp_color(palette.rail));g.FillPath(&bgBrush,&bgPath);
    float fw=std::max(rh,rw*float(fraction));
    Gdiplus::GraphicsPath fillPath;add_round_rect(fillPath,rx,ry,fw,rh,rh*0.5f);
    Gdiplus::SolidBrush fillBrush(gp_color(palette.accent));g.FillPath(&fillBrush,&fillPath);
   }
  }else{
   auto name=std::abs(x)<.05&&std::abs(y)<.05?L"智能均衡随机":L"随机偏好";text(mem,name,{p,px(14),w-p,px(44)},palette.accent);
   text(mem,L"待播预览 · 应用后按此顺序播放",{p,px(47),w-p,px(74)},palette.secondary);auto preview=state.value("preview",json(nullptr));auto rows=preview.is_object()?preview.value("tracks",json::array()):json::array();
   for(int i=0;i<8;++i){std::string title=i<int(rows.size())?rows[i].value("title",std::string{})+"  ·  "+rows[i].value("artist",std::string{}):i==0&&rows.empty()?(state.value("preview_pending",false)||waiting?"正在生成预览…":"没有待播歌曲"):"";text(mem,wide(title),{p,px(80+i*26),w-p,px(105+i*26)},palette.foreground);}
   text(mem,L"风格跳跃",{grid.left,grid.top-px(30),grid.right,grid.top-px(4)},palette.secondary,DT_CENTER);
   text(mem,L"风格相似",{grid.left,grid.bottom+px(4),grid.right,grid.bottom+px(30)},palette.secondary,DT_CENTER);
   text(mem,L"极少听",{px(10),grid.top,w/2-(grid.right-grid.left)/2-px(8),grid.bottom},palette.secondary,DT_RIGHT);
   text(mem,L"最常听",{grid.right+px(8),grid.top,w-px(10),grid.bottom},palette.secondary);
   {Gdiplus::Graphics g(mem);g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);Gdiplus::Rect box(grid.left,grid.top,grid.right-grid.left,grid.bottom-grid.top);Gdiplus::LinearGradientBrush gradient(box,ink(palette.gradientStart),ink(palette.gradientEnd),45);g.FillRectangle(&gradient,box);Gdiplus::Pen lines(ink(palette.gridInk,dark?30:45),1);
    for(int i=1;i<8;i++){float a=box.X+box.Width*i/8.f,b=box.Y+box.Height*i/8.f;g.DrawLine(&lines,a,float(box.Y),a,float(box.Y+box.Height));g.DrawLine(&lines,float(box.X),b,float(box.X+box.Width),b);}
    for(size_t i=0;i<trail.size();i++){Gdiplus::SolidBrush b(ink(palette.accent,BYTE(12+i*6)));float radius=float(px(5+int(i)));g.FillEllipse(&b,float(trail[i].x)-radius,float(trail[i].y)-radius,2*radius,2*radius);}
    float cx=grid.left+float((x+1)*.5*box.Width),cy=grid.top+float((1-y)*.5*box.Height),radius=float(px(12));Gdiplus::SolidBrush halo(ink(palette.accent,38)),ball(ink(palette.accent,240));g.FillEllipse(&halo,cx-radius*1.6f,cy-radius*1.6f,radius*3.2f,radius*3.2f);g.FillEllipse(&ball,cx-radius,cy-radius,2*radius,2*radius);}
  }
  SelectObject(mem,oldFont);BitBlt(dc,0,0,w,h,mem,0,0,SRCCOPY);SelectObject(mem,old);DeleteObject(image);DeleteDC(mem);
 }
 static LRESULT CALLBACK proc(HWND w,UINT msg,WPARAM wp,LPARAM lp){auto self=reinterpret_cast<Panel*>(GetWindowLongPtrW(w,GWLP_USERDATA));if(msg==WM_NCCREATE){self=static_cast<Panel*>(reinterpret_cast<CREATESTRUCTW*>(lp)->lpCreateParams);SetWindowLongPtrW(w,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(self));}if(!self)return DefWindowProcW(w,msg,wp,lp);
  try{switch(msg){
   case WM_CREATE:self->create(w);return 0;
   case WM_SIZE:self->layout();return 0;
   case WM_ERASEBKGND:return 1;
   case WM_PAINT:{PAINTSTRUCT p;auto dc=BeginPaint(w,&p);RECT r;GetClientRect(w,&r);if(r.right>0&&r.bottom>0)self->paint(dc,r.right,r.bottom);EndPaint(w,&p);return 0;}
   case WM_PRINTCLIENT:{RECT r;GetClientRect(w,&r);if(r.right>0&&r.bottom>0)self->paint(reinterpret_cast<HDC>(wp),r.right,r.bottom);return 0;}
   case appearanceChanged:self->refresh_appearance();return 0;
   case WM_CTLCOLORSTATIC:case WM_CTLCOLORBTN:SetTextColor(reinterpret_cast<HDC>(wp),self->palette.foreground);SetBkColor(reinterpret_cast<HDC>(wp),self->palette.background);return reinterpret_cast<LRESULT>(self->background);
   case WM_DRAWITEM:{auto d=reinterpret_cast<DRAWITEMSTRUCT*>(lp);wchar_t label[128]{};GetWindowTextW(d->hwndItem,label,128);bool primary=(wp==1102||wp==IDOK);draw_rounded_button(d->hDC,d->rcItem,self->palette,self->font,label,primary,(d->itemState&ODS_SELECTED)!=0,(d->itemState&ODS_DISABLED)!=0,(d->itemState&ODS_FOCUS)!=0,self->dpi,self->palette.background);return TRUE;}
   case WM_COMMAND:self->command(LOWORD(wp));return 0;
   case WM_GETDLGCODE:return DLGC_WANTARROWS|DLGC_WANTCHARS;
   case WM_KEYDOWN:if(wp==VK_ESCAPE)self->cancel();else if(wp==VK_RETURN)self->command(IDOK);else if(!self->update){if(wp==VK_LEFT)self->draft(self->x-.05,self->y);if(wp==VK_RIGHT)self->draft(self->x+.05,self->y);if(wp==VK_UP)self->draft(self->x,self->y+.05);if(wp==VK_DOWN)self->draft(self->x,self->y-.05);}return 0;
   case WM_LBUTTONDOWN:if(!self->update){POINT p{GET_X_LPARAM(lp),GET_Y_LPARAM(lp)};if(PtInRect(&self->grid,p)){self->drag=true;SetCapture(w);SetFocus(w);self->point(lp);}}return 0;
   case WM_MOUSEMOVE:if(self->drag&&(wp&MK_LBUTTON))self->point(lp);return 0;
   case WM_LBUTTONUP:if(self->drag){self->point(lp);self->drag=false;ReleaseCapture();}return 0;
   case WM_CAPTURECHANGED:self->drag=false;self->trail.clear();InvalidateRect(w,nullptr,FALSE);return 0;
   case WM_TIMER:if(wp==2){KillTimer(w,2);send({{"op","preview"},{"x",self->x},{"y",self->y}});self->waiting=false;}self->refresh();return 0;
   case WM_GETMINMAXINFO:{auto info=reinterpret_cast<MINMAXINFO*>(lp);MONITORINFO monitor{sizeof(monitor)};GetMonitorInfoW(MonitorFromWindow(w,MONITOR_DEFAULTTONEAREST),&monitor);int dpi=window_dpi(w);info->ptMinTrackSize={std::min(MulDiv(self->update?460:540,dpi,96),int(monitor.rcWork.right-monitor.rcWork.left)),std::min(MulDiv(self->update?310:640,dpi,96),int(monitor.rcWork.bottom-monitor.rcWork.top))};return 0;}
   case WM_DPICHANGED:{auto rect=reinterpret_cast<RECT*>(lp);SetWindowPos(w,nullptr,rect->left,rect->top,rect->right-rect->left,rect->bottom-rect->top,SWP_NOZORDER|SWP_NOACTIVATE);self->layout();return 0;}
   case WM_CLOSE:self->cancel();return 0;
   case WM_NCDESTROY:KillTimer(w,1);KillTimer(w,2);if(self->registered)modeless_dialog_manager::g_remove(w);if(self->update)updates=nullptr;else preference=nullptr;SetWindowLongPtrW(w,GWLP_USERDATA,0);if(self->ownedByWindow)delete self;return DefWindowProcW(w,msg,wp,lp);
  }}catch(const std::exception& e){if(msg==WM_CREATE)return -1;popup_message::g_show(e.what(),"智能随机");}
  return DefWindowProcW(w,msg,wp,lp);
 }
};
void open(bool update){auto& existing=update?updates:preference;if(IsWindow(existing)){ShowWindow(existing,SW_RESTORE);SetForegroundWindow(existing);return;}
 if(!update)send({{"op","open"}});
 static ATOM atom=[](){WNDCLASSEXW c{sizeof(c)};c.lpfnWndProc=Panel::proc;c.hInstance=core_api::get_my_instance();c.hCursor=LoadCursor(nullptr,IDC_ARROW);c.lpszClassName=L"SmartShufflePanel";return RegisterClassExW(&c);}();if(!atom)throw std::runtime_error("无法注册偏好窗口");
 auto panel=std::make_unique<Panel>(update);int dpi=window_dpi(core_api::get_main_window());MONITORINFO monitor{sizeof(monitor)};GetMonitorInfoW(MonitorFromWindow(core_api::get_main_window(),MONITOR_DEFAULTTONEAREST),&monitor);auto work=monitor.rcWork;int width=MulDiv(update?520:660,dpi,96),height=MulDiv(update?330:760,dpi,96);width=std::min(width,int(work.right-work.left));height=std::min(height,int(work.bottom-work.top));
 auto w=CreateWindowExW(WS_EX_CONTROLPARENT,L"SmartShufflePanel",update?L"Smart Shuffle · 更新":L"Smart Shuffle · 随机偏好",WS_OVERLAPPEDWINDOW|WS_CLIPCHILDREN,work.left+(work.right-work.left-width)/2,work.top+(work.bottom-work.top-height)/2,width,height,core_api::get_main_window(),nullptr,core_api::get_my_instance(),panel.get());
 if(!w)throw std::runtime_error("无法创建偏好窗口");panel->ownedByWindow=true;panel.release();existing=w;ShowWindow(w,SW_SHOW);SetFocus(w);
}
}
void set_dialog_handlers(DialogDispatch d,std::function<json()> s){dispatch=std::move(d);readState=std::move(s);}
void open_native_preference(){open(false);}
void open_updates(bool check){if(check)send({{"op","update_check"}});open(true);}
bool themed_installation(){return readState&&readState().value("update",json::object()).value("edition",std::string{})=="full";}
void refresh_native_dialog_appearance(){for(auto w:{preference,updates})if(IsWindow(w))SendMessageW(w,appearanceChanged,0,0);}
void close_native_dialogs(){if(IsWindow(preference))DestroyWindow(preference);if(IsWindow(updates))DestroyWindow(updates);}
}
