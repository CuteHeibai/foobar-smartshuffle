#pragma once
#include <algorithm>
namespace native_ss {
inline int dialog_dpi(int width,int height,int systemDpi,bool update){return std::max(48,std::min({systemDpi,width*96/(update?440:540),height*96/(update?260:600)}));}
}
