# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['tp_agent.py'],
    pathex=[],
    binaries=[],
    # icon.ico here (bundled, extracted to sys._MEIPASS at runtime) is
    # separate from EXE(...)'s icon=['icon.ico'] below -- that one only
    # brands the .exe file itself (Explorer/taskbar); this one lets the
    # running app set its own window icon via root.iconbitmap() at runtime,
    # since Tk can't reach into the exe's own embedded resource for that.
    datas=[('icon.ico', '.'), ('sysmon_config.xml', '.')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='truepositive-agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    # Measured no meaningful cold-start difference from UPX on this build
    # (both ~550-600ms average, well within run-to-run noise) and it didn't
    # even shrink the file here — python313.dll and friends mostly aren't
    # UPX-compressible. Left off anyway: packed executables are a known
    # trigger for stricter antivirus/SmartScreen scrutiny on an unsigned,
    # freshly-downloaded .exe, which isn't worth it for zero measured gain.
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['icon.ico'],
)
