#include <windows.h>
#include <d3d11.h>
#include <d3d11_4.h>
#include <wrl/client.h>
#include <cstddef>
#include <cstdint>
#include <cstring>

// Public prefix of AVFrame for libavutil 59, Windows x64.
// https://ffmpeg.org/doxygen/7.0/frame_8h_source.html
struct FramePrefix {
    uint8_t* data[8];
    int linesize[8];
    uint8_t** extended_data;
    int width, height, samples, format;
};
static_assert(offsetof(FramePrefix, width) == 104);
static_assert(offsetof(FramePrefix, format) == 116);

struct SurfaceInfo {
    uint32_t width, height, format, arraySize, mipLevels, sampleCount;
    uint32_t miscFlags, usage, bindFlags, arraySlice, restricted;
};

extern "C" __declspec(dllexport) HRESULT iqiyi_inspect_d3d11_frame(
    const FramePrefix* frame, SurfaceInfo* info, uint32_t capacity) {
    if (!frame || !info || capacity != sizeof(SurfaceInfo)) return E_INVALIDARG;
    if (frame->format != 116 || frame->width < 1 || frame->height < 1 ||
        frame->width > 8192 || frame->height > 8192) return E_INVALIDARG;
    if (!frame->data[3]) return E_POINTER;
    // Documented AV_PIX_FMT_D3D11VA_VLD representation, not a private offset.
    auto* view = reinterpret_cast<ID3D11VideoDecoderOutputView*>(frame->data[3]);
    Microsoft::WRL::ComPtr<ID3D11Resource> resource;
    view->GetResource(&resource);
    if (!resource) return E_POINTER;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> texture;
    HRESULT hr = resource.As(&texture);
    if (FAILED(hr)) return hr;
    D3D11_TEXTURE2D_DESC desc{};
    D3D11_VIDEO_DECODER_OUTPUT_VIEW_DESC viewDesc{};
    texture->GetDesc(&desc);
    view->GetDesc(&viewDesc);
    constexpr UINT restrictedMask = D3D11_RESOURCE_MISC_RESTRICTED_CONTENT |
        D3D11_RESOURCE_MISC_RESTRICT_SHARED_RESOURCE |
        D3D11_RESOURCE_MISC_RESTRICT_SHARED_RESOURCE_DRIVER |
        D3D11_RESOURCE_MISC_HW_PROTECTED;
    *info = {desc.Width, desc.Height, static_cast<uint32_t>(desc.Format),
        desc.ArraySize, desc.MipLevels, desc.SampleDesc.Count, desc.MiscFlags,
        static_cast<uint32_t>(desc.Usage), desc.BindFlags,
        viewDesc.Texture2D.ArraySlice, (desc.MiscFlags & restrictedMask) ? 1u : 0u};
    return S_OK;
}

// Copy an ordinary NV12/P010 decoder texture through supported D3D11 APIs.
// Restricted textures and contexts without multithread protection are rejected.
extern "C" __declspec(dllexport) HRESULT iqiyi_copy_d3d11_frame(
    const FramePrefix* frame, uint8_t* output, uint32_t capacity, uint32_t* written) {
    if (!written) return E_POINTER;
    *written = 0;
    SurfaceInfo info{};
    HRESULT hr = iqiyi_inspect_d3d11_frame(frame, &info, sizeof(info));
    if (FAILED(hr)) return hr;
    if (info.restricted) return E_ACCESSDENIED;
    if (info.format != DXGI_FORMAT_NV12 && info.format != DXGI_FORMAT_P010) return E_NOTIMPL;
    if ((frame->width & 1) || (frame->height & 1) || info.sampleCount != 1 ||
        static_cast<uint32_t>(frame->width) > info.width ||
        static_cast<uint32_t>(frame->height) > info.height) return E_INVALIDARG;
    const uint32_t stride = static_cast<uint32_t>(frame->width) * (info.format == DXGI_FORMAT_P010 ? 2u : 1u);
    const uint32_t required = stride * static_cast<uint32_t>(frame->height) * 3 / 2;
    if (!output || capacity < required) return HRESULT_FROM_WIN32(ERROR_INSUFFICIENT_BUFFER);
    auto* view = reinterpret_cast<ID3D11VideoDecoderOutputView*>(frame->data[3]);
    Microsoft::WRL::ComPtr<ID3D11Resource> resource;
    view->GetResource(&resource);
    Microsoft::WRL::ComPtr<ID3D11Device> device;
    resource->GetDevice(&device);
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> context;
    device->GetImmediateContext(&context);
    Microsoft::WRL::ComPtr<ID3D11Multithread> threading;
    hr = context.As(&threading);
    if (FAILED(hr) || !threading->GetMultithreadProtected()) return E_NOTIMPL;
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width=info.width;desc.Height=info.height;desc.MipLevels=1;desc.ArraySize=1;
    desc.Format=static_cast<DXGI_FORMAT>(info.format);desc.SampleDesc.Count=1;
    desc.Usage=D3D11_USAGE_STAGING;desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> staging;
    hr=device->CreateTexture2D(&desc,nullptr,&staging);
    if(FAILED(hr))return hr;
    threading->Enter();
    context->CopySubresourceRegion(staging.Get(),0,0,0,0,resource.Get(),
        D3D11CalcSubresource(0,info.arraySlice,info.mipLevels),nullptr);
    D3D11_MAPPED_SUBRESOURCE mapped{};
    hr=context->Map(staging.Get(),0,D3D11_MAP_READ,0,&mapped);
    if(SUCCEEDED(hr)) {
        if(mapped.RowPitch < stride) hr=E_UNEXPECTED;
        else {
            const auto* bytes=static_cast<const uint8_t*>(mapped.pData);
            for(int y=0;y<frame->height;y++)
                std::memcpy(output+static_cast<size_t>(y)*stride,bytes+static_cast<size_t>(y)*mapped.RowPitch,stride);
            const auto* uv=bytes+static_cast<size_t>(info.height)*mapped.RowPitch;
            auto* outUv=output+static_cast<size_t>(frame->height)*stride;
            for(int y=0;y<frame->height/2;y++)
                std::memcpy(outUv+static_cast<size_t>(y)*stride,uv+static_cast<size_t>(y)*mapped.RowPitch,stride);
            *written=required;
        }
        context->Unmap(staging.Get(),0);
    }
    threading->Leave();
    return hr;
}
