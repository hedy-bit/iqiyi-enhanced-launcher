#include <windows.h>
#include <d3d11.h>
#include <d3d11_4.h>
#include <wrl/client.h>
#include <cstdint>
#include <iostream>
#include <vector>
struct FramePrefix {uint8_t* data[8];int linesize[8];uint8_t** extended_data;int width,height,samples,format;};
struct SurfaceInfo {uint32_t width,height,format,arraySize,mipLevels,sampleCount,miscFlags,usage,bindFlags,arraySlice,restricted;};
extern "C" __declspec(dllimport) HRESULT iqiyi_inspect_d3d11_frame(const FramePrefix*,SurfaceInfo*,uint32_t);
extern "C" __declspec(dllimport) HRESULT iqiyi_copy_d3d11_frame(const FramePrefix*,uint8_t*,uint32_t,uint32_t*);
using Microsoft::WRL::ComPtr;
int main() {
    SurfaceInfo info{};
    if(iqiyi_inspect_d3d11_frame(nullptr,&info,sizeof(info))!=E_INVALIDARG)return 1;
    FramePrefix frame{};frame.width=128;frame.height=128;frame.format=116;
    if(iqiyi_inspect_d3d11_frame(&frame,&info,sizeof(info))!=E_POINTER)return 2;
    ComPtr<ID3D11Device> device;
    HRESULT hr=D3D11CreateDevice(nullptr,D3D_DRIVER_TYPE_HARDWARE,nullptr,
        D3D11_CREATE_DEVICE_VIDEO_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&device,nullptr,nullptr);
    if(FAILED(hr)){std::cout<<"deviceFailure="<<std::hex<<hr;return 3;}
    ComPtr<ID3D11VideoDevice> video;
    hr=device.As(&video);if(FAILED(hr))return 4;
    GUID profile{};bool found=false;
    for(UINT i=0;i<video->GetVideoDecoderProfileCount();i++) {
        BOOL supported=FALSE;
        if(SUCCEEDED(video->GetVideoDecoderProfile(i,&profile))&&
           SUCCEEDED(video->CheckVideoDecoderFormat(&profile,DXGI_FORMAT_NV12,&supported))&&supported){found=true;break;}
    }
    if(!found)return 5;
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width=128;desc.Height=128;desc.MipLevels=1;desc.ArraySize=3;
    desc.Format=DXGI_FORMAT_NV12;desc.SampleDesc.Count=1;desc.BindFlags=D3D11_BIND_DECODER;
    ComPtr<ID3D11Texture2D> texture;
    hr=device->CreateTexture2D(&desc,nullptr,&texture);if(FAILED(hr))return 6;
    D3D11_VIDEO_DECODER_OUTPUT_VIEW_DESC vd{};
    vd.DecodeProfile=profile;vd.ViewDimension=D3D11_VDOV_DIMENSION_TEXTURE2D;vd.Texture2D.ArraySlice=1;
    ComPtr<ID3D11VideoDecoderOutputView> view;
    hr=video->CreateVideoDecoderOutputView(texture.Get(),&vd,&view);
    if(FAILED(hr)){std::cout<<"viewFailure="<<std::hex<<hr;return 7;}
    frame.data[3]=reinterpret_cast<uint8_t*>(view.Get());
    hr=iqiyi_inspect_d3d11_frame(&frame,&info,sizeof(info));
    if(FAILED(hr)||info.width!=128||info.height!=128||info.arraySize!=3||info.arraySlice!=1||info.restricted)return 8;
    ComPtr<ID3D11DeviceContext> context;device->GetImmediateContext(&context);
    ComPtr<ID3D11Multithread> threading;
    if(FAILED(context.As(&threading)))return 9;
    threading->SetMultithreadProtected(TRUE); // Only the device created by this test.
    std::vector<uint8_t> pixels(128*128*3/2,128),output(pixels.size());
    for(size_t i=0;i<128*128;i++)pixels[i]=static_cast<uint8_t>(16+i%200);
    context->UpdateSubresource(texture.Get(),1,nullptr,pixels.data(),128,0);
    uint32_t written=0;
    if(iqiyi_copy_d3d11_frame(&frame,output.data(),1,&written)!=HRESULT_FROM_WIN32(ERROR_INSUFFICIENT_BUFFER))return 10;
    hr=iqiyi_copy_d3d11_frame(&frame,output.data(),static_cast<uint32_t>(output.size()),&written);
    if(FAILED(hr)||written!=pixels.size()||pixels!=output)return 11;
    std::cout<<"{\"passed\":true,\"scope\":\"self-created NV12 texture; exact pixel comparison\",\"arraySlice\":"<<info.arraySlice<<",\"bytesCompared\":"<<written<<"}";
    return 0;
}
