#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

namespace native_ss {
// ESLyric's recognized pane configuration stores a LOGFONT in field 7.
// Keep its wire record intact so the temporary fullscreen font can be undone.
struct EslyricField {
    size_t start = 0, end = 0;
    uint64_t number = 0, wire = 0, integer = 0;
    std::string_view bytes;
};

inline bool eslyric_varint(std::string_view bytes, size_t& pos, uint64_t& result) {
    result = 0;
    for (unsigned shift = 0; shift < 64 && pos < bytes.size(); shift += 7) {
        const auto byte = static_cast<unsigned char>(bytes[pos++]);
        if (shift == 63 && byte > 1) return false;
        result |= uint64_t(byte & 127) << shift;
        if (!(byte & 128)) return true;
    }
    return false;
}

inline bool eslyric_field(std::string_view data, size_t& pos, EslyricField& field) {
    field = {};
    field.start = pos;
    uint64_t tag = 0, length = 0;
    if (!eslyric_varint(data, pos, tag) || !(tag >> 3)) return false;
    field.number = tag >> 3;
    field.wire = tag & 7;
    switch (field.wire) {
    case 0: if (!eslyric_varint(data, pos, field.integer)) return false; break;
    case 1: length = 8; break;
    case 2: if (!eslyric_varint(data, pos, length)) return false; break;
    case 5: length = 4; break;
    default: return false;
    }
    if (length > data.size() - pos) return false;
    field.bytes = data.substr(pos, static_cast<size_t>(length));
    pos += static_cast<size_t>(length);
    field.end = pos;
    return true;
}

inline std::optional<EslyricField> eslyric_find_font(std::string_view data) {
    bool marker = false, panel = false;
    std::optional<EslyricField> font;
    for (size_t pos = 0; pos < data.size();) {
        EslyricField field;
        if (!eslyric_field(data, pos, field)) return {};
        if (field.number == 1) {
            if (marker || field.wire != 0 || field.integer != 4543308) return {};
            marker = true;
        } else if (field.number == 2) {
            if (panel || field.wire != 2 || field.bytes.size() != 36) return {};
            panel = true;
        } else if (field.number == 7) {
            if (font || field.wire != 2) return {};
            font = field;
        }
    }
    return marker && panel ? font : std::nullopt;
}

inline void eslyric_append_varint(std::string& out, uint64_t value) {
    while (value >= 128) {
        out.push_back(static_cast<char>((value & 127) | 128));
        value >>= 7;
    }
    out.push_back(static_cast<char>(value));
}

inline std::optional<std::string> eslyric_fullscreen_font(const EslyricField& original, unsigned height) {
    std::string payload;
    unsigned seen = 0;
    for (size_t pos = 0; pos < original.bytes.size();) {
        EslyricField field;
        if (!eslyric_field(original.bytes, pos, field)) return {};
        if (field.number >= 1 && field.number <= 5) {
            const unsigned bit = 1u << (field.number - 1);
            if (seen & bit || field.wire != (field.number == 5 ? 2u : 0u)) return {};
            seen |= bit;
        }
        if (field.number == 1 || field.number == 2) {
            eslyric_append_varint(payload, field.number << 3);
            eslyric_append_varint(payload, field.number == 1 ? height : 400);
        } else payload.append(original.bytes.substr(field.start, field.end - field.start));
    }
    if (seen != 31) return {};
    std::string record;
    eslyric_append_varint(record, (7 << 3) | 2);
    eslyric_append_varint(record, payload.size());
    record += payload;
    return record;
}

inline std::string eslyric_replace_font(std::string_view data, const EslyricField& font, std::string_view replacement) {
    std::string result;
    result.append(data.substr(0, font.start));
    result.append(replacement);
    result.append(data.substr(font.end));
    return result;
}
}
