# PyInstaller 打包配置
# 用于将 Python 脚本打包为独立可执行文件

# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

# generate-info 配置
generate_info_a = Analysis(
    ['generate-info.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('lib', 'lib'),
    ],
    hiddenimports=['yaml'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

generate_info_pyz = PYZ(
    generate_info_a.pure,
    generate_info_a.zipped_data,
    cipher=block_cipher,
)

generate_info_exe = EXE(
    generate_info_pyz,
    generate_info_a.scripts,
    generate_info_a.binaries,
    generate_info_a.zipfiles,
    generate_info_a.datas,
    [],
    name='generate-info',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# generate-share-file 配置
generate_share_file_a = Analysis(
    ['generate-share-file.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('lib', 'lib'),
    ],
    hiddenimports=['yaml'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

generate_share_file_pyz = PYZ(
    generate_share_file_a.pure,
    generate_share_file_a.zipped_data,
    cipher=block_cipher,
)

generate_share_file_exe = EXE(
    generate_share_file_pyz,
    generate_share_file_a.scripts,
    generate_share_file_a.binaries,
    generate_share_file_a.zipfiles,
    generate_share_file_a.datas,
    [],
    name='generate-share-file',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
