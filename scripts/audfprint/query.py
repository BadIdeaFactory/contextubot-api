import fire
import dumper

import audfprint_match
import audfprint_analyze
import hash_table

class Query(object):
    def match(self):
        matcher = audfprint_match.Matcher()
        matcher.find_time_range = True
        matcher.verbose = 1
        matcher.max_returns = 100

        analyzer = audfprint_analyze.Analyzer()
        analyzer.n_fft = 512
        analyzer.n_hop = analyzer.n_fft/2
        analyzer.shifts = 1
        # analyzer.exact_count = True
        analyzer.density = 20.0
        analyzer.target_sr = 11025

        hash_tab = hash_table.HashTable("./samples.pklz")
        hash_tab.params['samplerate'] = analyzer.target_sr

        qry = "./Samples/viral.afpt"
        rslts, dur, nhash = matcher.match_file(analyzer, hash_tab, "./Samples/viral.afpt", 0)
        t_hop = analyzer.n_hop / float(analyzer.target_sr)
        qrymsg = qry + (' %.1f ' % dur) + "sec " + str(nhash) + " raw hashes"

        msgrslt = []
        if len(rslts) == 0:
            nhashaligned = 0
            msgrslt.append("NOMATCH " + qrymsg)
        else:
            for (tophitid, nhashaligned, aligntime, nhashraw, rank, min_time, max_time) in rslts:
                    # msg = ("Matched {:6.1f} s starting at {:6.1f} s in {:s}"
                    #            " to time {:6.1f} s in {:s}").format(
                    #         (max_time - min_time) * t_hop, min_time * t_hop, qry,
                    #         (min_time + aligntime) * t_hop, hash_tab.names[tophitid])
                    msg = ("Matched {:6.1f} s starting at {:6.1f} s in {:s}"
                               " to time {:6.1f} s in {:n}; max {:6.1f} min {:6.1f} align {:6.1f} hop {:6.1f}").format(
                            (max_time - min_time) * t_hop, min_time * t_hop, qry,
                            (min_time + aligntime) * t_hop, tophitid,#),
                            max_time * t_hop, min_time * t_hop, aligntime * t_hop, t_hop)

                    msgrslt.append(msg)
        dumper.dump(msgrslt)


if __name__ == '__main__':
  fire.Fire(Query)