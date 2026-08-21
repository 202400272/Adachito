from .legacy import start_preview as _start_preview, stop_preview as _stop_preview

def start():
    return _start_preview()

def stop(proc):
    return _stop_preview(proc)
