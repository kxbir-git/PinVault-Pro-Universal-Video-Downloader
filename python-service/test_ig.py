import yt_dlp
import json

url = "https://www.pinterest.com/pin/589690144983057105/"

ydl_opts = {
    'quiet': False,
    'no_warnings': False,
    'noplaylist': True,
    'skip_download': True,
    'format': 'best',
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        print("Success!")
        print("Title:", info.get('title'))
        print("URL:", info.get('url'))
except Exception as e:
    print("Error:", str(e))
