package peerlabel

import (
	"math/rand"
	"strings"
	"sync"
)

var rngMu sync.Mutex

var placeWords = []string{
	"Puerto_Rico", "Buenos_Aires", "Cape_Town", "New_Orleans", "Rio_Grande",
	"Mount_Fuji", "Lake_Baikal", "Iceland", "Patagonia", "Santorini",
	"Yellowstone", "Sahara", "Himalaya", "Amazon", "Brooklyn",
	"Montreal", "Seville", "Kyoto", "Oslo", "Dublin",
}

func deviceFromUA(ua string) string {
	u := strings.ToLower(ua)
	switch {
	case strings.Contains(u, "iphone"):
		return "iPhone"
	case strings.Contains(u, "ipad"):
		return "iPad"
	case strings.Contains(u, "android"):
		if strings.Contains(u, "mobile") || !strings.Contains(u, "tablet") {
			return "Android"
		}
		return "Android_Tablet"
	case strings.Contains(u, "macintosh") || strings.Contains(u, "mac os"):
		return "MacBook"
	case strings.Contains(u, "windows"):
		return "Windows_Laptop"
	case strings.Contains(u, "linux"):
		return "Linux"
	case strings.Contains(u, "cros"):
		return "Chromebook"
	default:
		return "Device"
	}
}

func randomPlace() string {
	rngMu.Lock()
	defer rngMu.Unlock()
	return placeWords[rand.Intn(len(placeWords))]
}

func GenerateName(userAgent string) string {
	device := deviceFromUA(userAgent)
	place := randomPlace()
	return device + "_" + place
}
