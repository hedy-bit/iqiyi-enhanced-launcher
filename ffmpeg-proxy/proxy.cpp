// Opaque FFmpeg objects are forwarded untouched. No private structure offsets.
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include "forwarders.inc"

static HMODULE selfModule;
static HMODULE originalModule;
static std::once_flag initFlag;
static std::mutex statsMutex;
struct CodecInfo { int id = -1; int type = -1; std::string name = "unknown"; };
struct Stats { CodecInfo codec; uint64_t opened = 0, sent = 0, received = 0; };
static std::map<const void*, CodecInfo> codecs;
static std::map<void*, CodecInfo> contexts;
static std::map<std::string, Stats> totals;

BOOL WINAPI DllMain(HINSTANCE instance, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) selfModule = instance;
    return TRUE;
}

static HMODULE original() {
    std::call_once(initFlag, [] {
        wchar_t path[32768];
        DWORD n = GetModuleFileNameW(selfModule, path, 32768);
        if (!n || n >= 32768) return;
        std::wstring file(path, n);
        const auto slash = file.find_last_of(L"\\/");
        if (slash == std::wstring::npos) return;
        file.resize(slash + 1);
        file += L"iqiyi_codec_original.dll";
        originalModule = LoadLibraryExW(file.c_str(), nullptr,
            LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
    });
    return originalModule;
}

template<class T> static T function(const char* name) {
    auto module = original();
    FARPROC address = module ? GetProcAddress(module, name) : nullptr;
    T result{};
    static_assert(sizeof(result) == sizeof(address));
    std::memcpy(&result, &address, sizeof(result));
    return result;
}

// Only library codec identifiers are recorded; no URL, key, packet or frame data.
static std::string safeName(const char* name) {
    std::string result;
    if (name) for (size_t i = 0; i < 64 && name[i]; ++i) {
        const char c = name[i];
        result += ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                   (c >= '0' && c <= '9') || c == '_' || c == '-') ? c : '_';
    }
    return result.empty() ? "unknown" : result;
}

extern "C" const void* avcodec_find_decoder(int id) {
    static auto real = function<const void* (*)(int)>("avcodec_find_decoder");
    if (!real) return nullptr;
    const void* codec = real(id);
    if (codec) try {
        static auto name = function<const char* (*)(int)>("avcodec_get_name");
        static auto type = function<int (*)(int)>("avcodec_get_type");
        CodecInfo info{id, type ? type(id) : -1, safeName(name ? name(id) : nullptr)};
        std::lock_guard<std::mutex> lock(statsMutex);
        codecs[codec] = info;
    } catch (...) {}
    return codec;
}

extern "C" const void* avcodec_find_decoder_by_name(const char* name) {
    static auto real = function<const void* (*)(const char*)>("avcodec_find_decoder_by_name");
    if (!real) return nullptr;
    const void* codec = real(name);
    if (codec) try {
        std::lock_guard<std::mutex> lock(statsMutex);
        if (!codecs.count(codec)) codecs[codec] = CodecInfo{-1, -1, safeName(name)};
    } catch (...) {}
    return codec;
}

extern "C" int avcodec_open2(void* context, const void* codec, void** options) {
    static auto real = function<int (*)(void*, const void*, void**)>("avcodec_open2");
    if (!real) return -38;
    const int result = real(context, codec, options);
    if (result >= 0) try {
        std::lock_guard<std::mutex> lock(statsMutex);
        const CodecInfo info = codecs.count(codec) ? codecs.at(codec) : CodecInfo{};
        contexts[context] = info;
        auto& stats = totals[info.name];
        stats.codec = info;
        stats.opened++;
    } catch (...) {}
    return result;
}

static void count(void* context, bool frame) {
    std::lock_guard<std::mutex> lock(statsMutex);
    const auto found = contexts.find(context);
    const std::string name = found == contexts.end() ? "unknown" : found->second.name;
    auto& stats = totals[name];
    if (frame) stats.received++; else stats.sent++;
}

extern "C" int avcodec_send_packet(void* context, const void* packet) {
    static auto real = function<int (*)(void*, const void*)>("avcodec_send_packet");
    if (!real) return -38;
    const int result = real(context, packet);
    if (result >= 0 && packet) try { count(context, false); } catch (...) {}
    return result;
}

extern "C" int avcodec_receive_frame(void* context, void* frame) {
    static auto real = function<int (*)(void*, void*)>("avcodec_receive_frame");
    if (!real) return -38;
    const int result = real(context, frame);
    if (result >= 0) try { count(context, true); } catch (...) {}
    return result;
}

extern "C" void avcodec_free_context(void** context) {
    static auto real = function<void (*)(void**)>("avcodec_free_context");
    if (!real) return;
    if (context) try {
        std::lock_guard<std::mutex> lock(statsMutex);
        contexts.erase(*context);
    } catch (...) {}
    real(context);
}

extern "C" int avcodec_close(void* context) {
    static auto real = function<int (*)(void*)>("avcodec_close");
    if (!real) return -38;
    const int result = real(context);
    if (result >= 0) try {
        std::lock_guard<std::mutex> lock(statsMutex);
        contexts.erase(context);
    } catch (...) {}
    return result;
}

extern "C" __declspec(dllexport) uint32_t iqiyi_proxy_snapshot(char* buffer, uint32_t capacity) {
    try {
        std::lock_guard<std::mutex> lock(statsMutex);
        std::ostringstream text;
        text << "{\"activeContexts\":" << contexts.size() << ",\"codecs\":[";
        bool first = true;
        for (const auto& pair : totals) {
            const auto& s = pair.second;
            if (!first) text << ',';
            first = false;
            text << "{\"name\":\"" << pair.first << "\",\"id\":" << s.codec.id
                 << ",\"type\":" << s.codec.type << ",\"opened\":" << s.opened
                 << ",\"sent\":" << s.sent << ",\"received\":" << s.received << '}';
        }
        text << "]}";
        const auto json = text.str();
        const auto required = static_cast<uint32_t>(json.size() + 1);
        if (buffer && capacity >= required) std::memcpy(buffer, json.c_str(), required);
        return required;
    } catch (...) { return 0; }
}
