#pragma once
#include <windows.h>
#include <gdiplus.h>
#include <algorithm>

namespace native_ss {
struct NativePalette {
    COLORREF background, surface, surfacePressed, border;
    COLORREF foreground, secondary, accent, accentPressed, onAccent, rail;
    COLORREF gradientStart, gradientEnd, gridInk;
};

inline NativePalette native_palette(bool dark) {
    if (dark) return {
        RGB(22,23,26), RGB(36,38,43), RGB(48,50,56), RGB(54,57,64),
        RGB(226,226,226), RGB(175,175,175), RGB(64,156,255),
        RGB(44,132,235), RGB(8,10,14), RGB(62,65,72),
        RGB(34,44,68), RGB(26,56,78), RGB(255,255,255)
    };
    return {
        RGB(255,255,255), RGB(246,247,249), RGB(235,236,240), RGB(228,230,234),
        RGB(62,62,62), RGB(102,102,102), RGB(10,110,240),
        RGB(0,92,214), RGB(255,255,255), RGB(219,222,227),
        RGB(229,220,250), RGB(214,228,252), RGB(16,17,19)
    };
}

inline Gdiplus::Color gp_color(COLORREF c, BYTE a = 255) {
    return Gdiplus::Color(a, GetRValue(c), GetGValue(c), GetBValue(c));
}

inline void add_round_rect(Gdiplus::GraphicsPath& path, float x, float y, float w, float h, float r) {
    r = std::max(0.0f, std::min(r, std::min(w, h) * 0.5f));
    float d = r * 2.0f;
    if (d <= 0.5f) { path.AddRectangle(Gdiplus::RectF(x, y, w, h)); return; }
    path.AddArc(x, y, d, d, 180.0f, 90.0f);
    path.AddArc(x + w - d, y, d, d, 270.0f, 90.0f);
    path.AddArc(x + w - d, y + h - d, d, d, 0.0f, 90.0f);
    path.AddArc(x, y + h - d, d, d, 90.0f, 90.0f);
    path.CloseFigure();
}

inline void draw_rounded_button(HDC dc, const RECT& rc, const NativePalette& p, HFONT font,
                                const wchar_t* label, bool primary, bool pressed, bool disabled,
                                bool focused, int dpi, COLORREF parentBg) {
    HBRUSH bgBrush = CreateSolidBrush(parentBg);
    FillRect(dc, &rc, bgBrush);
    DeleteObject(bgBrush);
    int w = rc.right - rc.left, h = rc.bottom - rc.top;
    if (w <= 2 || h <= 2) return;
    float radius = float(MulDiv(8, dpi, 96));
    COLORREF fillCol = primary
        ? (disabled ? p.rail : (pressed ? p.accentPressed : p.accent))
        : (disabled ? p.surface : (pressed ? p.surfacePressed : p.surface));
    COLORREF textCol = primary
        ? (disabled ? p.secondary : p.onAccent)
        : (disabled ? p.secondary : p.foreground);
    {
        Gdiplus::Graphics g(dc);
        g.SetSmoothingMode(Gdiplus::SmoothingModeAntiAlias);
        Gdiplus::GraphicsPath path;
        add_round_rect(path, float(rc.left) + 0.5f, float(rc.top) + 0.5f, float(w) - 1.0f, float(h) - 1.0f, radius);
        Gdiplus::SolidBrush fill(gp_color(fillCol));
        g.FillPath(&fill, &path);
        if (!primary || focused) {
            Gdiplus::Pen pen(gp_color(focused ? p.accent : p.border), focused ? 1.5f : 1.0f);
            g.DrawPath(&pen, &path);
        }
    }
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, textCol);
    HGDIOBJ old = SelectObject(dc, font);
    RECT tr = rc;
    DrawTextW(dc, label, -1, &tr, DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS | DT_NOPREFIX);
    SelectObject(dc, old);
}

// Full installs supply the theme setting. Standalone installs follow foobar2000.
bool native_dark_mode();
}
