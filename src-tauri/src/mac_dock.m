#import <Cocoa/Cocoa.h>

void set_macos_dock_icon_from_path(const char* utf8_path) {
    if (!utf8_path) return;
    @autoreleasepool {
        NSString* path = [NSString stringWithUTF8String:utf8_path];
        NSImage* img = [[NSImage alloc] initWithContentsOfFile:path];
        if (img) {
            [NSApp setApplicationIconImage:img];
        }
    }
}
