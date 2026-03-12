package serve

import (
	"net/http"
	"path"
	"strings"
)

const indexName = "index.html"

func SPA(fs http.FileSystem) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		name := path.Clean("/" + strings.TrimPrefix(r.URL.Path, "/"))
		if name == "/" {
			name = "/" + indexName
		}
		openName := strings.TrimPrefix(name, "/")
		f, err := fs.Open(openName)
		if err == nil {
			defer f.Close()
			stat, err := f.Stat()
			if err == nil && !stat.IsDir() {
				http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
				return
			}
		}
		index, err := fs.Open(indexName)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer index.Close()
		stat, _ := index.Stat()
		http.ServeContent(w, r, indexName, stat.ModTime(), index)
	})
}
