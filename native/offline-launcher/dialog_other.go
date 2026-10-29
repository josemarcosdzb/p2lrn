//go:build !windows
package main
import "fmt"
func showError(_ string, message string){fmt.Println("P2LRN_OFFLINE_ERROR: "+message)}
