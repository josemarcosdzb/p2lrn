//go:build windows
package main
import (
 "syscall"
 "unsafe"
)
func showError(title,message string){
 user32:=syscall.NewLazyDLL("user32.dll"); proc:=user32.NewProc("MessageBoxW")
 t:=syscall.StringToUTF16Ptr(title);m:=syscall.StringToUTF16Ptr(message)
 proc.Call(0,uintptr(unsafe.Pointer(m)),uintptr(unsafe.Pointer(t)),uintptr(0x10))
}
