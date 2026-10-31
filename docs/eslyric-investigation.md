# ESLyric 触发 NVIDIA 覆盖层：只读调查

调查日期：2026-10-31。未修改安装中的 DLL、foobar2000 设置或 NVIDIA 设置；未操作歌词窗口，未重启播放器。

## 结论

**已生成一个很小的 ESLyric 修改副本，让它优先使用 CPU 的 WARP 渲染器；但目前不能保证这就能阻止 NVIDIA 覆盖层识别。** 已找到安装版本中准确的设备创建指令，并验证副本只改动了对应的一个字节。下一步应在独立播放器副本中做单变量实验，再决定是否安装。

ESLyric 确实使用 Direct2D/DirectWrite，官方也明确如此说明。[官方项目说明](https://github.com/ESLyric/release)

NVIDIA 是否把窗口作为“游戏”、为何注入覆盖层，是另一条证据链。本次仅证实正在运行的 foobar2000 已加载 `nvspcap64.dll` 及 NVIDIA 图形驱动 DLL，尚未做关闭/打开 ESLyric 的对照实验，不能把加载原因全部归给 ESLyric。

## 安装对象与工具边界

| 项目 | 已核实结果 |
| --- | --- |
| 文件 | `C:\Program Files\foobar2000\profile\user-components-x64\foo_uie_eslyric\foo_uie_eslyric.dll` |
| PE 类型 | native x64 DLL，首选映像基址 `0x180000000` |
| 文件/产品版本 | `1.0.6.7` |
| 长度 | 5,830,144 字节 |
| SHA-256 | `ac2e2c8fa2a481c8c217ce53d57f2bd8582c771bf75deab888207e43af43c583` |

REA 成功打开并确认上述对象；查询显示当前无可用 native 深度分析引擎：Ghidra 未配置、Hopper 不支持此 Windows 主机、IDA/Kuna 未配置。因此下面的 PE 导入、地址映射和反汇编来自本机 `pefile` + Capstone 的静态回退，**不是 REA 反编译结果，也不是运行时调用跟踪**。REA 会话已关闭。

## 已取得的证据

1. DLL 的 IAT 包含 `d3d11!D3D11CreateDevice`，槽位 VA `0x180442b78`；另有 `d2d1.dll` 和 `dcomp!DCompositionCreateDevice`。这与官方 Direct2D 渲染说明一致。
2. PE `.pdata` 标示的函数范围 `0x180026b20` 至 `0x180026e4c`（末端不含）中，存在先硬件、失败后 WARP 的设备创建逻辑。该函数引用源码路径字符串 `E:\src\foobar2000\foo_uie_eslyric\src\baselib\d2d_resources.cpp`。源码路径是二进制里的诊断字符串，不表示本机有该源码。
3. 使用 `.pdata` 函数边界扫描，找到该初始化函数的直接调用点 `0x180026977` 和资源重建路径中的 `0x180026f12`。没有声称已恢复所有间接调用关系。
4. 被动枚举正在运行的 foobar2000 模块，看到 `foo_uie_eslyric.dll`、`d3d11.dll`、`d2d1.dll`、`dcomp.dll`、`dxgi.dll`，以及 `nvldumdx.dll`、`nvwgf2umx.dll`、`nvspcap64.dll` 等 NVIDIA 模块。**模块存在证明已加载，不证明哪个组件导致注入，也不证明覆盖层当前显示了什么。**

关键反汇编（首选 VA；实际加载地址可能因 ASLR 不同）：

```asm
; 首次尝试：pAdapter=NULL, DriverType=1, Software=NULL
180026c0f  45 33 c0       xor r8d, r8d
180026c12  41 8d 50 01    lea edx, [r8+1]
180026c16  33 c9          xor ecx, ecx
180026c18  ff 15 ...      call [D3D11CreateDevice]
180026c1e  85 c0          test eax, eax
180026c20  0f 89 ...      jns 180026caa

; 首次失败后的尝试：DriverType=5
180026c76  45 33 c0       xor r8d, r8d
180026c79  41 8d 50 05    lea edx, [r8+5]
180026c7d  33 c9          xor ecx, ecx
180026c7f  ff 15 ...      call [D3D11CreateDevice]
```

Windows x64 ABI 的第二个整数参数是 EDX；微软函数签名中第二个参数就是 `DriverType`。枚举值 1 为 `D3D_DRIVER_TYPE_HARDWARE`，5 为 `D3D_DRIVER_TYPE_WARP`。WARP 是 CPU 软件光栅化器。[函数签名](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/nf-d3d11-d3d11createdevice)、[驱动类型定义](https://learn.microsoft.com/en-us/windows/win32/api/d3dcommon/ne-d3dcommon-d3d_driver_type)

## 是否已有可用的“软件/GDI”开关

- 官方当前 JS 接口文档将 `SetTextRenderer` 标为废弃，说明引擎固定为 Direct2D/DWrite；不能把旧 GDI 选项当成可靠解决方案。该文档更新于 2026-09-13，晚于本机 1.0.6.7，故这里只用它说明当前支持方向，不反推本机每一个接口的行为。[官方接口文档](https://github.com/ESLyric/release/wiki/%E5%A4%96%E9%83%A8JS%E9%9D%A2%E6%9D%BF%E6%8E%A7%E5%88%B6%E6%8E%A5%E5%8F%A3)
- 本机 DLL 保留了 `RENDER_ENGINE_DWRITE/GDI/GDIPLUS` 枚举名称。这仅证明字符串存在，不证明有可用的设置、更不证明切换后整个窗口不再创建 D3D 设备。
- DLL 里的 `Hardware`、`Software` 字符串周围是 `Interface`、`SAM`、`SECURITY`、`HKEY_*` 等注册表解析词；它们不是发现了渲染器选择控件。
- 官方发布记录说明 1.0.6.1 已移除 Direct Composition 设置；1.0.6.6 调整的是多线程/帧率设置。关闭多线程或降低帧率不等于禁用 D3D。[官方发布记录](https://github.com/ESLyric/release/releases)
- 本次没有发现经验证的现成 WARP/纯软件开关；没有穷尽隐藏配置，也没有操作 UI 去验证设置菜单。官方公开 `release` 仓库包含布局、本地化和发布说明，本次检查范围内没有可直接修改并编译的 native renderer 源码。

## 最小修改候选：仅改变首次设备类型

此表是**已生成副本、尚未运行验证的候选补丁**，仅适用于上面 SHA-256 对应的 DLL：

| 项目 | 值 |
| --- | --- |
| 指令 VA / RVA | `0x180026c12` / `0x26c12` |
| 指令文件偏移 | `0x26012` |
| 原始指令 | `41 8d 50 01`，`lea edx,[r8+1]` |
| 候选指令 | `41 8d 50 05`，`lea edx,[r8+5]` |
| 唯一变化字节 | 文件偏移 `0x26015`：`01` → `05` |
| 原始上下文字节，从 `0x2600b` 起 | `45 8d 4e 20 45 33 c0 41 8d 50 01 33 c9 ff 15 5a bf 41 00` |

该改变保留现有 BGRA/其余设备标志、功能级列表、资源重建和错误处理；只把第一次创建从硬件改为现有回退路径已经使用的 WARP。若首次 WARP 失败，原本的失败路径仍会再尝试一次 WARP。源码可用时，对应修改是把这次 `D3D11CreateDevice` 的第二参数改为 `D3D_DRIVER_TYPE_WARP`。

它的作用边界是：不再从此处请求 NVIDIA 硬件设备。**它仍然使用 D3D11/DXGI/Direct2D，保留交换链/合成路径；若 NVIDIA 依据 API 或 Present/交换链识别，WARP 仍可能触发覆盖层。** 还可能增加 CPU 占用。因此不能把这个单字节候选称为已解决误识别。

若目标是从架构上取消这条 Direct3D 呈现路径，需要开发无 D3D/DXGI 交换链的后端，例如软件位图渲染后用 GDI/分层窗口呈现，并重做背景、特效和透明合成；这超出了简单补丁范围。

## 已生成的实验副本

在项目目录运行：

```powershell
& .\scripts\patch-eslyric.ps1
```

脚本只在项目 `build\eslyric` 中输出副本，不覆盖输入或安装目录。输入必须匹配原始 SHA-256、版本、长度、原始无签名状态和邻接指令字节；任一不匹配即停止。已存在的输出只有内容完全一致时才接受，否则停止，避免覆盖其他实验产物。

| 产物 | 用途 / SHA-256 |
| --- | --- |
| `build\eslyric\foo_uie_eslyric.original.dll` | 原始字节副本；SHA-256 与安装原件相同 |
| `build\eslyric\foo_uie_eslyric.dll` | WARP 候选；`b3b5c5cbe93d0c515a15c4cdb44915bb729d76682a405d86095bed0e31df46df` |

已运行的离线验证：原始副本与安装文件逐字节相同；补丁文件大小不变，唯一差异为 `0x26015: 01→05`；PE 标准导入表内容与 IAT 地址完全相同；Capstone 将目标指令分别解码为 `[r8+1]` 与 `[r8+5]`；人为改变输入后脚本按 SHA-256 不匹配拒绝；重复运行接受相同产物；安装原件 SHA-256 仍然相同。

可逆性：目前安装目录完全未动，无需恢复。后续只在独立测试播放器的同名组件目录放入候选，并保留其原始 DLL；测试结束后关闭测试进程，再换回原始文件。若将来应用到正式安装，应先退出 foobar2000，保留原文件和配置备份；回退就是退出播放器并换回原 DLL。脚本不自动安装、不修改配置、不关闭任何进程。

## 建议的后续验证

1. 保存原 DLL 与当前配置备份，在独立 foobar2000 副本中验证；修改前核对 SHA-256 和原始上下文，避免把偏移用于其他版本。
2. 保持其他组件和 NVIDIA 设置一致，分别运行原版与仅此一个字节变化的版本；每次从全新进程开始，以免已加载的覆盖层模块干扰判断。
3. 分别打开面板、桌面和浮动歌词，核对显示、透明背景、滚动、尺寸变化及 CPU 占用；同一实验记录覆盖层提示、NVIDIA 列表状态和加载模块变化。
4. 如果仍被识别，就已否定“只移除硬件设备即可解决”的假设；不继续随意改窗口名、枚举字符串或伪造模块名。下一步是确认 NVIDIA 的具体检测/呈现入口，或选择覆盖层设置作为应用侧以外的处理方式。

## 后续实际 A/B 验证（2026-10-31）

已在独立副本中使用同一 `foobar2000.exe` 路径分别加载原版与 WARP 候选，每次重启进程。原版加载 `nvldumdx.dll`、`nvwgf2umx.dll` 和 `nvspcap64.dll`；候选只出现 `d2d1.dll`、`d3d11.dll`，没有上述 NVIDIA 驱动/覆盖层模块。记录位于项目 `build/eslyric-original-modules.json`、`build/eslyric-warp-modules.json`。随后在中文 Columns UI 主题及原生歌词宿主中再次确认候选可加载。

此结果支持修改避开了本机观察到的 NVIDIA 注入入口。没有使用 Computer Use 验收可见覆盖层提示、桌面/浮动歌词、视觉效果或 CPU 占用；不把模块差异等同于所有 NVIDIA 版本下的检测保证。正式安装由备份安装脚本执行，原 DLL 和配置均随备份保留。上文“目前安装目录完全未动”描述的是最初静态调查阶段。
