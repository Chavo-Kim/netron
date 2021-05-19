<p align='center'><a href='https://github.com/lutzroeder/netron'><img width='400px' height='100px' src='.github/logo.svg'/></a></p>

**Netron for Furiosa AI**

Furiosa compiler 의 결과물 (.dot) 을 열어볼 수 있도록 개조된 netron 입니다.

## Install

**macOS**: [**Download**](https://github.com/Chavo-Kim/netron/releases/latest) the `.dmg` file

**Windows**: [**Download**](https://github.com/Chavo-Kim/netron/releases/latest) the `.exe` installer

## Deploy

```bash
# Make .dmg setup file
$ npx electron-builder --mac --universal
# Make .exe setup file
$ npx electron-builder --win --x64 --arm64
```

## Test data
`data/` 디렉토리의 파일들은 무리 없이 열어볼 수 있는 파일입니다.
`data_backup/` 의 경우 열어볼수 없거나, 열어볼 수 있지만 열었을 때 렉이 심한 파일들입니다.